import { q, q1 } from "@/lib/db";
import { fail, isMember, json, requireUser, setupDone } from "@/lib/api";
import { settleRound } from "@/lib/pipeline";
import { planTallies, votingSchemaReady, VotingSchemaPendingError } from "@/lib/voting";
import { ballotComplete, isRemoved } from "@/lib/votingRules";

/**
 * Confirm your votes for the open round. Needs a vote on every plan still in the running (removed plans don't count).
 * After this your votes are final. Once every member has confirmed, voting closes.
 */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const id = Number((await params).id);
  if (!(await isMember(id, uid))) return fail("not in this group", 403);
  if (!(await setupDone(id, uid))) return fail("finish your setup first", 409);
  if (!(await votingSchemaReady())) return fail(new VotingSchemaPendingError().message, 503);

  const round = await q1<any>("select id,status from plan_rounds where group_id=$1 and status<>'failed' order by id desc limit 1", [id]);
  if (!round || round.status !== "voting") return fail("voting is closed", 409);

  const members = (await q1<any>("select count(*)::int n from memberships where group_id=$1", [id])).n;
  const mine = await q<{ plan_id: number; value: string }>(
    "select v.plan_id,v.value from votes v join plans p on p.id=v.plan_id where p.round_id=$1 and v.user_id=$2", [round.id, uid]);
  const open = (await planTallies(round.id)).filter((p) => !isRemoved(p.vetoes, members));
  if (!ballotComplete(open.map((p) => mine.find((v) => v.plan_id === p.id)?.value))) {
    return fail("vote on every plan before confirming", 409);
  }

  await q("insert into vote_confirmations(round_id,user_id) values($1,$2) on conflict do nothing", [round.id, uid]);
  return json({ ok: true, status: await settleRound(round.id) });
}
