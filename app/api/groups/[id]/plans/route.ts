import { q, q1 } from "@/lib/db";
import { fail, isMember, json, requireUser } from "@/lib/api";
import { computeSplit, fillRound, settleRound, startRound, withStopCosts } from "@/lib/pipeline";

export const maxDuration = 60;

/** Screen 8: start finding plans (or join the search already running). Also used to regenerate after an all-veto round. */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const id = Number((await params).id);
  if (!(await isMember(id, uid))) return fail("not in this group", 403);
  const r = await startRound(id);
  if (!r.created) return json({ roundId: r.roundId, status: r.status });
  try {
    await fillRound(r.roundId);
  } catch {
    return fail("couldn't make plans this time. Try again.", 502);
  }
  return json({ roundId: r.roundId, status: "voting" });
}

/**
 * Polled every few seconds by screens 8-10.
 * Privacy: during voting only your own votes and a "voted" count are returned, never tallies or who voted what.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const id = Number((await params).id);
  if (!(await isMember(id, uid))) return fail("not in this group", 403);
  const g = await q1<any>("select name,created_by from groups where id=$1", [id]);
  const base = { group: { name: g.name }, me: uid, isCreator: g.created_by === uid };

  let round = await q1<any>("select id,status from plan_rounds where group_id=$1 and status<>'failed' order by id desc limit 1", [id]);
  if (!round) return json({ ...base, round: null, plans: [] });
  if (round.status === "voting") await settleRound(round.id);
  round = await q1<any>(
    `select id,status,group_tier,winner_plan_id,slot,attempt,excluded,vote_deadline,split_mode,requests_sent,payer_id,created_at,
       greatest(0, extract(epoch from vote_deadline - now()))::int seconds_left
     from plan_rounds where id=$1`, [round.id]);

  const open = round.status === "voting" || round.status === "generating";
  const plans = await q<any>(
    `select p.id,p.title,p.summary,p.stops,p.est_cost_per_person::float cost,p.price_level,p.why_fits,
       count(v.*) filter (where v.value='approve')::int approve, count(v.*) filter (where v.value='pass')::int veto,
       max(v.value) filter (where v.user_id=$2) my_vote
     from plans p left join votes v on v.plan_id=p.id where p.round_id=$1 group by p.id order by p.id`, [round.id, uid]);
  for (const p of plans) {
    p.stops = withStopCosts(p.stops, p.cost);
    p.my_vote = p.my_vote === "pass" ? "veto" : p.my_vote;
    if (open) { delete p.approve; delete p.veto; }
  }
  const members = await q<{ id: number; name: string }>("select u.id,u.name from memberships m join users u on u.id=m.user_id where m.group_id=$1 order by m.joined_at", [id]);
  const voted = (await q1<any>(
    `select count(*)::int c from (select v.user_id from votes v join plans p on p.id=v.plan_id where p.round_id=$1 group by v.user_id having count(*) = $2) x`,
    [round.id, plans.length]))!.c;

  let split = null, payments: any[] = [];
  if (round.status === "final") {
    split = await computeSplit(round.id);
    payments = await q<any>("select p.id,p.user_id,u.name,p.amount::float amount,p.status from payments p join users u on u.id=p.user_id where p.round_id=$1 order by p.id", [round.id]);
  }
  return json({ ...base, round, plans, members, memberCount: members.length, voted, split, payments, isPayer: round.payer_id === uid });
}
