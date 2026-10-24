import { q, q1 } from "@/lib/db";
import { fail, isMember, json, requireUser } from "@/lib/api";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const { value } = await req.json().catch(() => ({}));
  if (value !== "approve" && value !== "pass") return fail("value must be approve or pass");
  const row = await q1<any>("select r.group_id, r.status from plans p join plan_rounds r on r.id=p.round_id where p.id=$1", [Number((await params).id)]);
  if (!row || !(await isMember(row.group_id, uid))) return fail("not allowed", 403);
  if (row.status !== "voting") return fail("voting is closed", 409);
  await q("insert into votes(plan_id,user_id,value) values($1,$2,$3) on conflict (plan_id,user_id) do update set value=excluded.value", [Number((await params).id), uid, value]);
  return json({ ok: true });
}
