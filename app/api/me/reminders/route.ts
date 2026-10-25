import { q } from "@/lib/db";
import { json, requireUser } from "@/lib/api";

export const dynamic = "force-dynamic";

// What the signed-in user still owes, newest reminder first. Only their own payments.
export async function GET() {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  return json(await q<any>(
    `select p.id, g.id group_id, g.name group_name, payer.name payer_name, p.amount::float amount, p.reminded_at
     from payments p join plan_rounds r on r.id=p.round_id join groups g on g.id=r.group_id join users payer on payer.id=r.payer_id
     where p.user_id=$1 and p.status='owed' and r.requests_sent
     order by p.reminded_at desc nulls last, p.id desc`, [uid]));
}
