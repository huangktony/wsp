import { resolveRoundCity } from "@/lib/finding";
import { MissingCityError, PlaceSearchError } from "@/lib/serpapi";
import { getVotingParticipation } from "@/lib/voting";
import { q, q1 } from "@/lib/db";
import { fail, isMember, json, requireUser, setupDone } from "@/lib/api";
import {
  FinalPlanError,
  NoPlacesError,
  SearchSchemaPendingError,
  computeSplit,
  fillRound,
  settleRound,
  startRound,
  withStopCosts,
} from "@/lib/pipeline";
import { redrawStatus } from "@/lib/redraw";
import { isRemoved } from "@/lib/votingRules";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Screen 8: start finding plans (or join the search already running). Also used to regenerate after an all-veto round. */
export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;

  const id = Number((await params).id);
  if (!(await isMember(id, uid))) return fail("not in this group", 403);
  if (!(await setupDone(id, uid))) {
    return fail("finish your setup first", 409);
  }

  try {
    const r = await startRound(id);
    if (!r.created) {
      return json({ roundId: r.roundId, status: r.status });
    }

    await fillRound(r.roundId);
    return json({ roundId: r.roundId, status: "voting" });
  } catch (e) {
    if (e instanceof FinalPlanError) return fail(e.message, 409);
    if (e instanceof SearchSchemaPendingError) return fail(e.message, 503);
    if (e instanceof PlaceSearchError) return fail(e.message, 502);
    if (e instanceof MissingCityError) return fail(e.message, 400);
    if (e instanceof NoPlacesError) return fail(e.message, 422);
    return fail("couldn't make plans this time. Try again.", 502);
  }
}

/**
 * Polled every few seconds by screens 8-10.
 * Privacy: during voting only your own votes and a "voted" count are returned, never tallies or who voted what.
 */
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;

  const id = Number((await params).id);
  if (!(await isMember(id, uid))) return fail("not in this group", 403);

  const g = await q1<any>(
    "select name,city,created_by from groups where id=$1",
    [id],
  );
  const base = {
    group: { name: g.name },
    me: uid,
    isCreator: g.created_by === uid,
  };

  let round = await q1<any>(
    "select id,status from plan_rounds where group_id=$1 and status<>'failed' order by id desc limit 1",
    [id],
  );
  if (!round) return json({ ...base, round: null, plans: [] });

  if (round.status === "voting") await settleRound(round.id);

  round = await q1<any>(
    `select id,status,to_jsonb(r)->>'search_city' search_city,(to_jsonb(r)->>'sample_places')::boolean sample_places,group_tier,winner_plan_id,slot,attempt,excluded,vote_deadline,split_mode,requests_sent,payer_id,created_at,
       to_jsonb(r)->>'confirmed_at' confirmed_at,
       greatest(0, extract(epoch from vote_deadline - now()))::int seconds_left
     from plan_rounds r where id=$1`,
    [round.id],
  );

  round.search_city = resolveRoundCity(round).city;
  const open = round.status === "voting" || round.status === "generating";

  const { voted, confirmed, memberCount, roundOpen, confirmedMemberIds } = await getVotingParticipation(id, round);

  // Tallies count only current members, the same votes the winner was picked from.
  const plans = await q<any>(
    `select p.id,p.title,p.summary,p.stops,p.est_cost_per_person::float cost,p.price_level,p.why_fits,
       count(m.user_id) filter (where v.value='approve')::int approve, count(m.user_id) filter (where v.value='pass')::int veto,
       max(v.value) filter (where v.user_id=$2) my_vote
     from plans p left join votes v on v.plan_id=p.id left join memberships m on m.user_id=v.user_id and m.group_id=$3
     where p.round_id=$1 group by p.id order by p.id`,
    [round.id, uid, id],
  );

  for (const p of plans) {
    p.stops = withStopCosts(p.stops, p.cost);
    p.my_vote = p.my_vote === "pass" ? "veto" : p.my_vote;
    // A majority veto removes the plan. Saying so is the one result shared while voting is open.
    p.removed = isRemoved(p.veto, memberCount);
    if (open) {
      delete p.approve;
      delete p.veto;
    }
  }

  const members = await q<{ id: number; name: string }>(
    "select u.id,u.name from memberships m join users u on u.id=m.user_id where m.group_id=$1 order by m.joined_at",
    [id],
  );

  let split = null,
    payments: any[] = [];
  if (round.status === "final") {
    split = await computeSplit(round.id);
    payments = await q<any>(
      "select p.id,p.user_id,u.name,p.amount::float amount,p.status,p.reminded_at from payments p join users u on u.id=p.user_id where p.round_id=$1 order by p.id",
      [round.id],
    );
  }

  return json({
    ...base,
    round,
    plans,
    members,
    memberCount,
    voted,
    confirmed,
    myConfirmed: confirmedMemberIds.includes(uid),
    roundOpen,
    split,
    payments,
    isPayer: round.payer_id === uid,
    redraw: await redrawStatus(id, uid),
  });
}
