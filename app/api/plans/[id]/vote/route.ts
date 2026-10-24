import { q, q1 } from "@/lib/db";
import { fail, isMember, json, requireUser } from "@/lib/api";
import { settleRound } from "@/lib/pipeline";

/** Body: { value: "approve" | "veto" | null }. null clears your vote. "pass" is accepted as an old name for veto. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const planId = Number((await params).id);
  const { value } = await req.json().catch(() => ({}));
  if (value !== "approve" && value !== "veto" && value !== "pass" && value !== null) return fail("value must be approve, veto or null");
  const row = await q1<any>("select r.id round_id, r.group_id, r.status from plans p join plan_rounds r on r.id=p.round_id where p.id=$1", [planId]);
  if (!row || !(await isMember(row.group_id, uid))) return fail("not allowed", 403);
  if (row.status !== "voting") return fail("voting is closed", 409);
  if (value === null) await q("delete from votes where plan_id=$1 and user_id=$2", [planId, uid]);
  else await q("insert into votes(plan_id,user_id,value) values($1,$2,$3) on conflict (plan_id,user_id) do update set value=excluded.value",
    [planId, uid, value === "approve" ? "approve" : "pass"]);
  // The last vote in closes the round right away.
  return json({ ok: true, status: await settleRound(row.round_id) });
}
