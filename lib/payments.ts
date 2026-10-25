import { q, q1 } from "@/lib/db";
import { PaymentError, maskKey, sendPayment, transferStatus } from "@/lib/nessie";

type Result = { ok: true; transferId: string; status: string } | { error: string; status: number };
const err = (error: string, status: number): Result => ({ error, status });

/**
 * A member pays what they owe. The row only becomes 'paid' after Nessie accepts the transfer; until then it stays 'owed'.
 * The claim (transfer_id = 'sending') is what stops a double tap or a second device from sending twice. paid_at doubles as the
 * claim time so a claim abandoned by a crashed request can be retaken after two minutes.
 */
export async function payDue(paymentId: number, userId: number): Promise<Result> {
  const p = await q1<any>(
    `select p.id,p.amount::float amount,p.status,p.transfer_id,me.nessie_account_id from_acct,payer.nessie_account_id to_acct,g.name
     from payments p join plan_rounds r on r.id=p.round_id join groups g on g.id=r.group_id
       join users me on me.id=p.user_id left join users payer on payer.id=r.payer_id
     where p.id=$1 and p.user_id=$2`, [paymentId, userId]);
  if (!p) return err("not your payment", 403);
  if (p.status === "paid" || (p.transfer_id && p.transfer_id !== "sending")) return err("This is already paid.", 409);
  const claimed = await q1(
    `update payments set transfer_id='sending', paid_at=now()
     where id=$1 and status='owed' and (transfer_id is null or (transfer_id='sending' and paid_at < now() - interval '2 minutes')) returning id`, [p.id]);
  if (!claimed) return err("This payment is already being sent.", 409);
  try {
    const sent = await sendPayment({ payId: p.id, fromAccount: p.from_acct, toAccount: p.to_acct, amount: p.amount, groupName: p.name });
    await q("update payments set status='paid', transfer_id=$2, transfer_status=$3, paid_at=now() where id=$1", [p.id, sent.transferId, sent.status]);
    return { ok: true, transferId: sent.transferId, status: sent.status };
  } catch (e: any) {
    await q("update payments set transfer_id=null, paid_at=null where id=$1 and status='owed'", [p.id]);
    if (e instanceof PaymentError) return err(e.message, 422);
    console.error(maskKey(`payment failed: ${e?.message ?? e}`));
    return err("Couldn't send the payment, nothing was charged. Try again.", 502);
  }
}

/** What a member still owes in one group, across all its rounds. */
export async function duesInGroup(groupId: number, userId: number): Promise<number> {
  const r = await q1<{ owed: number }>(
    `select coalesce(sum(p.amount),0)::float owed from payments p join plan_rounds r on r.id=p.round_id
     where r.group_id=$1 and p.user_id=$2 and p.status='owed'`, [groupId, userId]);
  return r?.owed ?? 0;
}

/** Asks Nessie where this round's not-yet-completed transfers stand and stores the answer. A Nessie outage leaves the old status. */
export async function refreshTransferStatuses(roundId: number): Promise<void> {
  const rows = await q<{ id: number; transfer_id: string; acct: string }>(
    `select p.id,p.transfer_id,u.nessie_account_id acct from payments p join users u on u.id=p.user_id
     where p.round_id=$1 and p.status='paid' and p.transfer_id not like 'local-%' and p.transfer_id<>'sending'
       and coalesce(p.transfer_status,'')<>'completed'`, [roundId]);
  for (const r of rows) {
    try {
      const s = await transferStatus(r.acct, r.transfer_id);
      if (s) await q("update payments set transfer_status=$2 where id=$1", [r.id, s]);
    } catch (e: any) {
      console.error(maskKey(`transfer status refresh failed: ${e?.message ?? e}`));
    }
  }
}
