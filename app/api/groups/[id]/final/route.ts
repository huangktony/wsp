import { q, q1 } from "@/lib/db";
import { fail, json, requireUser } from "@/lib/api";
import { pickWinner } from "@/lib/pipeline";

// Creator-only "Lock in plan". Even split. TODO(decision): even split vs split by tier.
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const id = Number((await params).id);
  const g = await q1<any>("select created_by from groups where id=$1", [id]);
  if (!g || g.created_by !== uid) return fail("only the group creator can lock in", 403);
  const round = await q1<any>("select id,status from plan_rounds where group_id=$1 order by id desc limit 1", [id]);
  if (!round || round.status !== "voting") return fail("no open round", 409);
  const winner = await pickWinner(round.id);
  const plan = await q1<any>("select est_cost_per_person::float cost from plans where id=$1", [winner]);
  await q("update plan_rounds set status='final', winner_plan_id=$1 where id=$2", [winner, round.id]);
  await q("insert into payments(round_id,user_id,amount) select $1, user_id, $2 from memberships where group_id=$3 on conflict do nothing", [round.id, plan.cost, id]);
  return json({ winner });
}
