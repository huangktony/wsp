import { q, q1 } from "@/lib/db";
import { fail, json, requireUser } from "@/lib/api";
import { maskKey, recordPayback } from "@/lib/nessie";

// Pay back the person who paid up front. In live mode this records a withdrawal on your Nessie account and a deposit on theirs.
// If recording fails, the payment goes back to 'owed' so it can never show "paid" without the bank record.
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const p = await q1<any>(
    `select p.id,p.amount::float amount,p.status,me.nessie_account_id from_acct,payer.nessie_account_id to_acct,g.name
     from payments p join plan_rounds r on r.id=p.round_id join groups g on g.id=r.group_id
       join users me on me.id=p.user_id left join users payer on payer.id=r.payer_id
     where p.id=$1 and p.user_id=$2`, [Number((await params).id), uid]);
  if (!p) return fail("not your payment", 403);
  // Claim first so a double tap can't record the payment twice.
  const claimed = await q1("update payments set status='paid' where id=$1 and status='owed' returning id", [p.id]);
  if (!claimed) return json({ ok: true });
  try {
    await recordPayback({ payId: p.id, fromAccount: p.from_acct, toAccount: p.to_acct, amount: p.amount, label: `${p.name} hangout` });
  } catch (e: any) {
    await q("update payments set status='owed' where id=$1", [p.id]);
    console.error(maskKey(`recording the payment failed: ${e?.message ?? e}`));
    return fail("Couldn't record the payment, try again", 502);
  }
  return json({ ok: true });
}
