import { pool, q, q1 } from "./db";
import { groupTier } from "./tier";
import { categoriesFor, estCost, findPlaces, type Place } from "./serpapi";
import { generatePlans } from "./gemini";

/*
 * Plan round lifecycle (plan_rounds.status):
 *   generating -> voting -> final      (a plan won)
 *                        -> vetoed     (every plan was vetoed, none approved; next round leaves those places out)
 *   generating -> failed               (generation crashed or stalled)
 * After final, the payer (group creator) picks even / by item split and sends requests (requests_sent).
 */

/** Availability is a list of slot strings like "Fri evening". Pick the slot shared by most members. */
export function bestSlot(avails: string[][]): { slot: string; free: number } {
  const count = new Map<string, number>();
  for (const a of avails) for (const s of a) count.set(s, (count.get(s) ?? 0) + 1);
  const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
  return top ? { slot: top[0], free: top[1] } : { slot: "Sat evening", free: avails.length };
}

/**
 * Claims a new round for the group, or returns the round already in progress.
 * Uses a per-group advisory lock so two members opening "Finding plans" at once make one round, not two.
 */
export async function startRound(groupId: number): Promise<{ roundId: number; status: string; created: boolean }> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select pg_advisory_xact_lock(4242, $1)", [groupId]);
    // A round stuck in generating for 2+ minutes crashed. Mark it failed so a new one can start.
    await c.query("update plan_rounds set status='failed' where group_id=$1 and status='generating' and created_at < now() - interval '2 minutes'", [groupId]);
    const last = (await c.query("select id,status,attempt,excluded from plan_rounds where group_id=$1 and status<>'failed' order by id desc limit 1", [groupId])).rows[0];
    if (last && (last.status === "generating" || last.status === "voting")) {
      await c.query("commit");
      return { roundId: last.id, status: last.status, created: false };
    }
    // After an all-veto round, carry the attempt count and the places to leave out.
    const vetoed = last?.status === "vetoed";
    const excluded: string[] = vetoed ? last.excluded : [];
    const attempt = vetoed ? last.attempt + 1 : 1;
    const r = await c.query("insert into plan_rounds(group_id,status,attempt,excluded) values($1,'generating',$2,$3) returning id", [groupId, attempt, excluded]);
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
export async function fillRound(roundId: number): Promise<void> {
  try {
    const round = await q1<any>("select r.id,r.group_id,r.excluded,g.city,g.lat,g.lng,g.vote_hours from plan_rounds r join groups g on g.id=r.group_id where r.id=$1", [roundId]);
    const members = await q<any>("select m.availability, u.interests from memberships m join users u on u.id=m.user_id where m.group_id=$1", [round.group_id]);
    // Members who haven't finished setup don't drag the slot or interests down.
    const ready = members.filter((m) => (m.availability as string[]).length);
    const basis = ready.length ? ready : members;
    const { slot, free } = bestSlot(basis.map((m) => m.availability as string[]));
    const tier = await groupTier(round.group_id);
    const sets = basis.map((m) => m.interests as string[]);
    const shared = sets.length ? sets[0].filter((i) => sets.every((s) => s.includes(i))) : [];
    const interests = shared.length ? shared : [...new Set(sets.flat())];

    const excluded = new Set<string>(round.excluded ?? []);
    const found = await findPlaces(categoriesFor(interests), round.lat, round.lng, tier);
    const fresh = found.filter((p) => !excluded.has(p.name));
    // If leaving out vetoed places empties the list, reuse them rather than show nothing.
    const places = fresh.length >= 2 ? fresh : found;
    const drafts = await generatePlans({ city: round.city, slot, tier, interests, places, avoid: [...excluded] });

    const byName = new Map(places.map((p) => [p.name.toLowerCase(), p] as [string, Place]));
    for (const d of drafts) {
      const stops = enrichStops(d.stops, d.est_cost_per_person, byName);
      const total = stops.reduce((s, x) => s + x.cost, 0) || d.est_cost_per_person;
      const price = total <= 20 ? "$" : total <= 40 ? "$$" : "$$$";
      const why = free < basis.length ? `${d.why_fits} ${free} of ${basis.length} are free ${slot}.` : d.why_fits;
      await q("insert into plans(round_id,title,summary,stops,est_cost_per_person,price_level,why_fits) values($1,$2,$3,$4,$5,$6,$7)",
        [roundId, d.title, d.summary, JSON.stringify(stops), total, price, why]);
    }
    const hours = round.vote_hours ?? 24;
    await q("update plan_rounds set status='voting', slot=$2, group_tier=$3, vote_deadline=now() + make_interval(hours => $4) where id=$1", [roundId, slot, tier, hours]);
  } catch (e) {
    await q("update plan_rounds set status='failed' where id=$1", [roundId]);
    throw e;
  }
}

export type Stop = { place: string; time: string; address?: string; category?: string; price?: string; cost: number };

/** Adds address/category and a per-person cost to each stop. Stop costs add up to the plan's estimate. */
function enrichStops(stops: { place: string; time: string }[], planCost: number, byName: Map<string, Place>): Stop[] {
  const out = stops.map((s) => {
    const p = byName.get(s.place.toLowerCase());
    return { ...s, address: p?.address, category: p?.category, price: p?.price, cost: p ? estCost(p.price) : 0 };
  });
  const sum = out.reduce((a, s) => a + s.cost, 0);
  if (!sum) out.forEach((s) => (s.cost = Math.round(planCost / out.length)));
  else if (planCost > 0 && Math.abs(sum - planCost) > 1) out.forEach((s) => (s.cost = Math.round((s.cost * planCost) / sum)));
  return out;
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
     from plans p left join votes v on v.plan_id=p.id where p.round_id=$1 group by p.id order by approves desc, vetoes asc, cost asc, p.id asc`, [roundId]);
  return { id: rows[0].id as number, approves: rows[0].approves as number, allVetoed: rows.every((r) => r.approves === 0 && r.vetoes > 0) };
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
     from plan_rounds r where r.id=$1`, [roundId]);
  if (!r || r.status !== "voting") return r?.status ?? "missing";
  if (!force && !r.expired && r.votes < r.plans * r.members) return "voting";

  const w = await pickWinner(roundId);
  if (w.allVetoed) {
    const names = await q<{ place: string }>("select distinct s->>'place' place from plans p, jsonb_array_elements(p.stops) s where p.round_id=$1", [roundId]);
    const done = await q1("update plan_rounds set status='vetoed', excluded=excluded || $2::text[] where id=$1 and status='voting' returning id", [roundId, names.map((n) => n.place)]);
    return done ? "vetoed" : (await q1<any>("select status from plan_rounds where id=$1", [roundId])).status;
  }
  await q(`update plan_rounds set status='final', winner_plan_id=$2, payer_id=(select created_by from groups where id=$3) where id=$1 and status='voting'`, [roundId, w.id, r.group_id]);
  return "final";
}

/**
 * Who pays what for the winning plan. Each stop has a per-person cost; members can skip stops.
 *  - even:  everyone going splits the real total evenly.
 *  - items: each person pays only for the stops they go to.
 * Amounts are in cents so they always add up to the total.
 */
export async function computeSplit(roundId: number) {
  const r = await q1<any>("select r.group_id,r.split_mode,r.payer_id,p.stops from plan_rounds r join plans p on p.id=r.winner_plan_id where r.id=$1", [roundId]);
  if (!r) return null;
  const stops = r.stops as Stop[];
  const members = await q<{ id: number; name: string }>("select u.id,u.name from memberships m join users u on u.id=m.user_id where m.group_id=$1 order by m.joined_at", [r.group_id]);
  const skips = await q<{ user_id: number; stop_index: number }>("select user_id,stop_index from stop_skips where round_id=$1", [roundId]);
  const skipped = (uid: number) => skips.filter((s) => s.user_id === uid).map((s) => s.stop_index);

  const rows = members.map((m) => {
    const sk = skipped(m.id);
    const cents = stops.reduce((a, s, i) => a + (sk.includes(i) ? 0 : Math.round(s.cost * 100)), 0);
    return { user_id: m.id, name: m.name, skips: sk, going: sk.length < stops.length, itemCents: cents, cents: 0 };
  });
  const total = rows.reduce((a, x) => a + x.itemCents, 0);
  if (r.split_mode === "items") rows.forEach((x) => (x.cents = x.itemCents));
  else {
    const going = rows.filter((x) => x.going);
    const base = going.length ? Math.floor(total / going.length) : 0;
    going.forEach((x, i) => (x.cents = base + (i < total - base * going.length ? 1 : 0)));
  }
  return {
    mode: r.split_mode as "even" | "items",
    payerId: r.payer_id as number,
    total: total / 100,
    rows: rows.map(({ itemCents, cents, ...x }) => ({ ...x, amount: cents / 100 })),
  };
}
