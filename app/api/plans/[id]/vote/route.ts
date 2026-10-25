import { q, q1 } from "@/lib/db";
import { fail, isMember, json, requireUser, setupDone } from "@/lib/api";
import { settleRound } from "@/lib/pipeline";
import { confirmedMemberIds, planTallies, votingSchemaReady } from "@/lib/voting";
import { isRemoved } from "@/lib/votingRules";

/**
 * Body: { value: "approve" | "veto" | null }. null clears your vote. "pass" is accepted as an old name for veto.
 * 409 once you confirmed your votes, or when a majority already vetoed the plan (it is removed).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const planId = Number((await params).id);
  const { value } = await req.json().catch(() => ({}));
  if (value !== "approve" && value !== "veto" && value !== "pass" && value !== null) return fail("value must be approve, veto or null");
  const row = await q1<any>("select r.id round_id, r.group_id, r.status from plans p join plan_rounds r on r.id=p.round_id where p.id=$1", [planId]);
  if (!row || !(await isMember(row.group_id, uid))) return fail("not allowed", 403);
  if (!(await setupDone(row.group_id, uid))) return fail("finish your setup first", 409);
  if (row.status !== "voting") return fail("voting is closed", 409);
  if ((await confirmedMemberIds(row.round_id)).includes(uid)) return fail("your votes are confirmed and can't change", 409);

  const members = (await q1<any>("select count(*)::int n from memberships where group_id=$1", [row.group_id])).n;
  const plan = (await planTallies(row.round_id)).find((p) => p.id === planId);
  if (plan && isRemoved(plan.vetoes, members)) return fail("a majority vetoed this plan, so it was removed", 409);

  // The write itself re-checks confirmation, so a vote racing a confirm from another tab can't slip in after it.
  const unconfirmed = (await votingSchemaReady())
    ? "not exists (select 1 from vote_confirmations c join plans p on p.round_id=c.round_id where p.id=$1 and c.user_id=$2)"
    : "true";
  if (value === null) await q(`delete from votes where plan_id=$1 and user_id=$2 and ${unconfirmed}`, [planId, uid]);
  else await q(`insert into votes(plan_id,user_id,value) select $1::int,$2::int,$3::text where ${unconfirmed}
    on conflict (plan_id,user_id) do update set value=excluded.value`,
    [planId, uid, value === "approve" ? "approve" : "pass"]);
  // A veto that removes the last plan in the running closes the round right away.
  return json({ ok: true, status: await settleRound(row.round_id) });
}
