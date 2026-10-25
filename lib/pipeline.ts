import { roundSettings, searchPreferences, settingsChanged } from "./roundSettings";
import { bestSlot, resolveRoundCity, sameCity } from "./finding";
export { bestSlot } from "./finding";
import { pool, q, q1 } from "./db";
import { groupTier } from "./tier";
import { categoriesFor, findPlaces, MissingCityError, PlaceSearchError, type Place } from "./serpapi";
import { planLevel } from "./price";
import { generatePlans } from "./gemini";
import { splitAmounts, type SplitMode } from "./split";

/*
 * Plan round lifecycle (plan_rounds.status):
 *   generating -> voting -> final      (a plan won)
 *                        -> vetoed     (every plan was vetoed, none approved; next round leaves those places out)
 *   generating -> failed               (generation crashed or stalled)
 *   generating/voting -> superseded    (a new search replaced this attempt)
 * After final, the payer (group creator) picks even / by item split and sends requests (requests_sent).
 */

/** Nothing within the group budget was found. The message is shown to the user as is. */
export class NoPlacesError extends Error {}

export class SearchSchemaPendingError extends Error {
  constructor() {
    super("Plan search needs a database update. Ask the group organizer to apply the round search migration.");
  }
}

/** Check explicitly before writing optional metadata; never recover from a failed SQL statement. */
async function hasSearchMetadata(query: (sql: string, args: unknown[]) => Promise<{ rows: any[] }>) {
  const result = await query(
    "select count(*)::int count from information_schema.columns where table_schema=current_schema() and table_name='plan_rounds' and column_name=any($1::text[])",
    [["search_city", "search_distance_mi", "sample_places", "search_error", "search_settings"]],
  );
  return result.rows[0]?.count === 5;
}

/** The latest round is final. Only the group's redraw vote (lib/redraw.ts) can replace it. */
export class FinalPlanError extends Error {}

/**
 * Claims a new round for the group, or returns the round already in progress.
 * Uses a per-group advisory lock so two members opening "Finding plans" at once make one round, not two.
 */
export async function startRound(groupId: number): Promise<{ roundId: number; status: string; created: boolean }> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select pg_advisory_xact_lock(4242, $1)", [groupId]);

    const group = (await c.query("select city from groups where id=$1 for share", [groupId])).rows[0];
    const city = group?.city?.trim();
    if (!city) throw new MissingCityError();

    const members = (await c.query(
      "select m.user_id,m.availability,m.comfort_tier,u.budget_tier,u.interests,u.max_distance_mi from memberships m join users u on u.id=m.user_id where m.group_id=$1 order by m.user_id",
      [groupId],
    )).rows;
    const settings = roundSettings(members);
    const preferences = searchPreferences(settings);
    const sample = process.env.USE_SAMPLE_PLACES === "true";

    // A round stuck in generating for 2+ minutes crashed. Mark it failed so a new one can start.
    await c.query(
      "update plan_rounds set status='failed' where group_id=$1 and status='generating' and created_at < now() - interval '2 minutes'",
      [groupId],
    );

    // A failed redraw explicitly restores its previous final; otherwise use the
    // newest attempt, including failures, so an older voting round cannot resurface.
    const last = (await c.query(
      "select id,status,attempt,excluded,to_jsonb(r)->'search_settings' search_settings,to_jsonb(r)->>'search_city' search_city,(to_jsonb(r)->>'sample_places')::boolean sample_places from plan_rounds r where group_id=$1 order by (status='final') desc,id desc limit 1 for update",
      [groupId],
    )).rows[0];

    if (last?.status === "final") {
      throw new FinalPlanError("The plan is final. Ask the group for new plans instead.");
    }

    if (
      last &&
      !settingsChanged(last.search_settings, settings) &&
      sameCity(resolveRoundCity(last).city, city) &&
      (last.sample_places ?? false) === sample &&
      (last.status === "generating" || last.status === "voting")
    ) {
      await c.query("commit");
      return { roundId: last.id, status: last.status, created: false };
    }

    // After an all-veto round, carry the attempt count and the places to leave out.
    const vetoed = last?.status === "vetoed" &&
      sameCity(resolveRoundCity(last).city, city) &&
      (last.sample_places ?? false) === sample;
    const excluded: string[] = vetoed ? last.excluded : [];
    const attempt = vetoed ? last.attempt + 1 : 1;

    if (!(await hasSearchMetadata((sql, args) => c.query(sql, args)))) {
      throw new SearchSchemaPendingError();
    }
    if (!preferences?.distance) {
      throw new Error("No group distance preference available");
    }

    // Superseded work must not re-open voting when an older provider call returns.
    await c.query("update plan_rounds set status='superseded' where group_id=$1 and status in ('generating','voting')", [groupId]);

    const r = await c.query(
      "insert into plan_rounds(group_id,status,attempt,excluded,search_city,search_distance_mi,sample_places,group_tier,search_settings) values($1,'generating',$2,$3,$4,$5,$6,$7,$8::jsonb) returning id",
      [groupId, attempt, excluded, city, preferences.distance, sample, preferences.tier, JSON.stringify(settings)],
    );

    await c.query("commit");
    return { roundId: r.rows[0].id, status: "generating", created: true };
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** Runs the engine for a claimed round: shared slot -> group tier -> places -> 3 plans -> open voting. */
export async function fillRound(roundId: number, find: typeof findPlaces = findPlaces): Promise<void> {
  try {
    const round = await q1<any>(
      `select r.id,r.group_id,r.excluded,r.group_tier,to_jsonb(r)->'search_settings' search_settings,to_jsonb(r)->>'search_city' search_city,
      coalesce((to_jsonb(r)->>'search_distance_mi')::int,
        (select min(u.max_distance_mi)::int from memberships m join users u on u.id=m.user_id where m.group_id=r.group_id and jsonb_array_length(m.availability)>0)) search_distance_mi,
      (to_jsonb(r)->>'sample_places')::boolean sample_places,g.city current_city,g.lat,g.lng,g.vote_hours
      from plan_rounds r join groups g on g.id=r.group_id where r.id=$1`,
      [roundId],
    );

    const { city, coords } = resolveRoundCity(round, {
      city: round.current_city,
      lat: round.lat,
      lng: round.lng,
    });
    const members: { availability: string[]; interests: string[] }[] =
      round.search_settings ?? await q<any>(
        "select m.availability, u.interests from memberships m join users u on u.id=m.user_id where m.group_id=$1",
        [round.group_id],
      );

    // Members who haven't finished setup don't drag the slot or interests down.
    const ready = members.filter((m) => (m.availability as string[]).length);
    const basis = ready.length ? ready : members;
    const { slot, free } = bestSlot(basis.map((m) => m.availability as string[]));
    const tier = round.group_tier ?? await groupTier(round.group_id);
    const sets = basis.map((m) => m.interests as string[]);
    const shared = sets.length ? sets[0].filter((i) => sets.every((s) => s.includes(i))) : [];
    const interests = shared.length ? shared : [...new Set(sets.flat())];

    const excluded = new Set<string>(round.excluded ?? []);
    const found = await find(
      categoriesFor(interests),
      city,
      tier,
      round.search_distance_mi,
      {
        sample: round.sample_places === true,
        center: coords ? { latitude: coords.lat, longitude: coords.lng } : undefined,
      },
    );
    const fresh = found.filter((p) => !excluded.has(p.name));

    // If leaving out vetoed places empties the list, reuse them rather than show nothing.
    const places = fresh.length >= 2 ? fresh : found;
    const drafts = await generatePlans({
      city,
      slot,
      tier,
      interests,
      places,
      maxDistanceMi: round.search_distance_mi,
      avoid: [...excluded],
    });

    if (!drafts.length) {
      throw new NoPlacesError(`No places found within the ${tier} budget near ${city}. Try more interests or a bigger distance.`);
    }

    const byName = new Map(places.map((p) => [p.name.toLowerCase(), p] as [string, Place]));

    for (const d of drafts) {
      const stops = enrichStops(d.stops, d.est_cost_per_person, byName);

      // One definition: the cost is the sum of the stop costs, the level is the most expensive stop.
      const total = stops.reduce((s, x) => s + x.cost, 0);
      const price = planLevel(stops);
      const radiusNote = found.find((p) => p.radiusNote)?.radiusNote;
      const baseWhy = radiusNote ? `${d.why_fits} ${radiusNote}` : d.why_fits;
      const why = free < basis.length ? `${baseWhy} ${free} of ${basis.length} are free ${slot}.` : baseWhy;

      await q(
        "insert into plans(round_id,title,summary,stops,est_cost_per_person,price_level,why_fits) values($1,$2,$3,$4,$5,$6,$7)",
        [roundId, d.title, d.summary, JSON.stringify(stops), total, price, why],
      );
    }

    // Preserve the actual radius used for the Finding screen; requested settings remain in the snapshot.
    const usedRadius = Math.max(round.search_distance_mi, ...found.map((p) => p.searchRadiusMi ?? 0));
    if (round.search_settings) {
      await q("update plan_rounds set search_distance_mi=$2 where id=$1", [roundId, usedRadius]);
    }

    const hours = round.vote_hours ?? 24;
    await q(
      "update plan_rounds set status='voting', slot=$2, group_tier=$3, vote_deadline=now() + make_interval(hours => $4) where id=$1 and status='generating'",
      [roundId, slot, tier, hours],
    );
  } catch (e) {
    const message = e instanceof MissingCityError || e instanceof PlaceSearchError || e instanceof NoPlacesError
      ? e.message
      : "Couldn't make plans this time. Try again.";

    if (await hasSearchMetadata(async (sql, args) => ({ rows: await q(sql, args) }))) {
      await q("update plan_rounds set status='failed',search_error=$2 where id=$1 and status='generating'", [roundId, message]);
    } else {
      await q("update plan_rounds set status='failed' where id=$1 and status='generating'", [roundId]);
    }
    throw e;
  }
}

export type Stop = {
  place: string;
  time: string;
  address?: string;
  category?: string;
  price?: string;
  cost: number;
  estimated?: boolean;
};

/** Adds address, category, price and a per-person cost to each stop. The plan's cost is the sum of these. */
function enrichStops(
  stops: { place: string; time: string }[],
  planCost: number,
  byName: Map<string, Place>,
): Stop[] {
  return stops.map((s) => {
    const p = byName.get(s.place.toLowerCase());

    // An unknown place should not get this far (plans are checked against the candidates), so this only spreads the model's own estimate.
    return {
      ...s,
      address: p?.address,
      category: p?.category,
      price: p?.price,
      estimated: p ? p.priceEstimated : true,
      cost: p ? p.cost : Math.round(planCost / stops.length),
    };
  });
}

/**
 * Plans made before stops had a per-stop cost (older rounds) only store { place, time }.
 * Fill in the missing costs by sharing the plan's total across its stops, so the split never gets NaN.
 */
export function withStopCosts(stops: any[], planCost: number): Stop[] {
  const list = Array.isArray(stops) ? stops : [];
  const known = list.reduce((a, s) => a + (Number.isFinite(Number(s.cost)) ? Number(s.cost) : 0), 0);
  const missing = list.filter((s) => !Number.isFinite(Number(s.cost))).length;
  const each = missing ? Math.max(0, (Number(planCost) || 0) - known) / missing : 0;

  return list.map((s) => ({
    ...s,
    cost: Number.isFinite(Number(s.cost)) ? Number(s.cost) : Math.round(each * 100) / 100,
  }));
}

/** Back-compat for the seed script: claim and fill a round in one go. */
export async function runFindPlans(groupId: number): Promise<number> {
  const r = await startRound(groupId);
  if (r.created) await fillRound(r.roundId);
  return r.roundId;
}

/** Most approvals wins; then fewest vetoes; ties go to lower cost. */
export async function pickWinner(roundId: number) {
  const rows = await q<any>(
    `select p.id, p.est_cost_per_person::float cost,
       count(v.*) filter (where v.value='approve')::int approves, count(v.*) filter (where v.value='pass')::int vetoes
     from plans p left join votes v on v.plan_id=p.id where p.round_id=$1 group by p.id order by approves desc, vetoes asc, cost asc, p.id asc`,
    [roundId],
  );

  return {
    id: rows[0].id as number,
    approves: rows[0].approves as number,
    allVetoed: rows.every((r) => r.approves === 0 && r.vetoes > 0),
  };
}

/**
 * Closes voting when the deadline passed, everyone voted on every plan, or `force` (creator's "close now").
 * Safe to call on every poll: the status check in the update makes it run once.
 */
export async function settleRound(roundId: number, force = false): Promise<string> {
  const r = await q1<any>(
    `select r.id,r.status,r.group_id,(r.vote_deadline < now()) expired,
       (select count(*)::int from plans where round_id=r.id) plans,
       (select count(*)::int from memberships where group_id=r.group_id) members,
       (select count(*)::int from votes v join plans p on p.id=v.plan_id join memberships m on m.user_id=v.user_id and m.group_id=r.group_id where p.round_id=r.id) votes
     from plan_rounds r where r.id=$1 and r.id=(select id from plan_rounds where group_id=r.group_id order by (status='final') desc,id desc limit 1)`,
    [roundId],
  );

  if (!r || r.status !== "voting") return r?.status ?? "missing";
  if (!force && !r.expired && r.votes < r.plans * r.members) return "voting";

  const w = await pickWinner(roundId);

  if (w.allVetoed) {
    const names = await q<{ place: string }>(
      "select distinct s->>'place' place from plans p, jsonb_array_elements(p.stops) s where p.round_id=$1",
      [roundId],
    );
    const done = await q1(
      "update plan_rounds set status='vetoed', excluded=excluded || $2::text[] where id=$1 and status='voting' returning id",
      [roundId, names.map((n) => n.place)],
    );
    return done
      ? "vetoed"
      : (await q1<any>("select status from plan_rounds where id=$1", [roundId])).status;
  }

  await q(
    `update plan_rounds set status='final', winner_plan_id=$2, payer_id=(select created_by from groups where id=$3) where id=$1 and status='voting'`,
    [roundId, w.id, r.group_id],
  );
  return (await q1<any>("select status from plan_rounds where id=$1", [roundId])).status;
}

/**
 * Who pays what for the winning plan. Each stop has a per-person cost; members can skip stops.
 *  - even:  everyone going splits the real total evenly.
 *  - items: each person pays only for the stops they go to.
 * Amounts are in cents so they always add up to the total.
 */
export async function computeSplit(roundId: number) {
  const r = await q1<any>(
    "select r.group_id,r.split_mode,r.payer_id,p.stops,p.est_cost_per_person::float plan_cost from plan_rounds r join plans p on p.id=r.winner_plan_id where r.id=$1",
    [roundId],
  );
  if (!r) return null;

  const stops = withStopCosts(r.stops, r.plan_cost);
  const members = await q<{ id: number; name: string }>(
    "select u.id,u.name from memberships m join users u on u.id=m.user_id where m.group_id=$1 order by m.joined_at",
    [r.group_id],
  );
  const skips = await q<{ user_id: number; stop_index: number }>(
    "select user_id,stop_index from stop_skips where round_id=$1",
    [roundId],
  );
  const skipped = (uid: number) => skips.filter((s) => s.user_id === uid).map((s) => s.stop_index);

  const { total, rows } = splitAmounts(
    stops.map((s) => s.cost),
    members.map((m) => ({ user_id: m.id, name: m.name, skips: skipped(m.id) })),
    r.split_mode,
  );

  return {
    mode: r.split_mode as SplitMode,
    payerId: r.payer_id as number,
    total,
    rows,
  };
}