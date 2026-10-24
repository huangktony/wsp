import { q, q1 } from "@/lib/db";
import { fail, json, requireUser } from "@/lib/api";
import { sendTransfer } from "@/lib/nessie";

// Pay back the person who paid up front. Uses a Nessie transfer when both accounts are real; otherwise demo only.
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const p = await q1<any>(
    `select p.id,p.amount::float amount,p.status,me.nessie_account_id from_acct,payer.nessie_account_id to_acct,g.name
     from payments p join plan_rounds r on r.id=p.round_id join groups g on g.id=r.group_id
       join users me on me.id=p.user_id left join users payer on payer.id=r.payer_id
     where p.id=$1 and p.user_id=$2`, [Number((await params).id), uid]);
  if (!p) return fail("not your payment", 403);
  // Claim first so a double tap can't send two transfers.
  const claimed = await q1("update payments set status='paid' where id=$1 and status='owed' returning id", [p.id]);
  if (!claimed) return json({ ok: true });
  const transferId = await sendTransfer(p.from_acct, p.to_acct, p.amount, `WSP: ${p.name} hangout`);
  await q("update payments set transfer_id=$1 where id=$2", [transferId, p.id]);
  return json({ ok: true });
}
