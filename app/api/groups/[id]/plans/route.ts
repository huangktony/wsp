import { q, q1 } from "@/lib/db";
import { fail, isMember, json, requireUser } from "@/lib/api";
import { runFindPlans } from "@/lib/pipeline";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const id = Number((await params).id);
  if (!(await isMember(id, uid))) return fail("not in this group", 403);
  return json({ roundId: await runFindPlans(id) });
}

/** Polled every 3s: current round, plans, tallies, my votes, payments if final. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const id = Number((await params).id);
  if (!(await isMember(id, uid))) return fail("not in this group", 403);
  const round = await q1<any>("select id,status,group_tier,winner_plan_id from plan_rounds where group_id=$1 order by id desc limit 1", [id]);
  if (!round) return json({ round: null, plans: [], memberCount: 0 });
  const plans = await q<any>(
    `select p.id,p.title,p.summary,p.stops,p.est_cost_per_person::float cost,p.price_level,p.why_fits,
       count(v.*) filter (where v.value='approve')::int approve, count(v.*) filter (where v.value='pass')::int pass,
       max(v.value) filter (where v.user_id=$2) my_vote
     from plans p left join votes v on v.plan_id=p.id where p.round_id=$1 group by p.id order by p.id`, [round.id, uid]);
  const memberCount = (await q1<any>("select count(*)::int c from memberships where group_id=$1", [id]))!.c;
  const g = await q1<any>("select created_by from groups where id=$1", [id]);
  const payments = round.status === "final"
    ? await q<any>("select p.id,p.user_id,u.name,p.amount::float amount,p.status from payments p join users u on u.id=p.user_id where p.round_id=$1 order by p.id", [round.id])
    : [];
  return json({ round, plans, memberCount, payments, me: uid, isCreator: g.created_by === uid });
}
