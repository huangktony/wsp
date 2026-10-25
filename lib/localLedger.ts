// Mock mode and mock- accounts: Nessie never sees hangouts or paybacks (see recordHangout, recordPayback), so the Spending screen
// builds the same rows from our own payments table instead. Same shapes as live mode, so analyze() treats them identically.
import { q } from "./db";
import { HANGOUT_CATEGORY, HANGOUT_MERCHANT } from "./hangout";
import { splitDescription, type LedgerEntry } from "./ledger";
import type { SpendingData } from "./nessie";

const day = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
// A user who never linked has no account id; any non-empty stand-in keeps the row, and the name falls back to "a friend".
const acct = (id: string | null, userId: number) => id ?? `user-${userId}`;

/** Adds this user's up-front hangout bills (purchases) and paybacks made or received (ledger rows) to `data`. */
export async function withLocalRecords(data: SpendingData, uid: number): Promise<SpendingData> {
  const hangouts = await q<{ id: number; total: number; at: Date }>(
    `select id, bill_total::float total, coalesce(requests_sent_at, created_at) at from plan_rounds
     where payer_id=$1 and requests_sent and bill_total > 0`, [uid]);
  const paybacks = await q<{ id: number; amount: number; at: Date; out: boolean; other_id: number; other_acct: string | null; label: string }>(
    `select p.id, p.amount::float amount, coalesce(p.paid_at, r.created_at) at, p.user_id=$1 "out",
       other.id other_id, other.nessie_account_id other_acct, g.name || ' hangout' label
     from payments p join plan_rounds r on r.id=p.round_id join groups g on g.id=r.group_id
       join users other on other.id = case when p.user_id=$1 then r.payer_id else p.user_id end
     where p.status='paid' and (p.user_id=$1 or r.payer_id=$1)`, [uid]);

  const merchants = new Map(data.merchants);
  const merchantId = `mock:${HANGOUT_MERCHANT}`;
  if (hangouts.length) merchants.set(merchantId, { name: HANGOUT_MERCHANT, category: HANGOUT_CATEGORY });
  const purchases = [...data.purchases, ...hangouts.map((h) => ({ merchant_id: merchantId, purchase_date: day(h.at), amount: h.total, status: "completed" }))];
  const ledger: LedgerEntry[] = [...data.ledger, ...paybacks.map((p) => ({
    kind: p.out ? ("out" as const) : ("in" as const), date: day(p.at), amount: p.amount,
    description: splitDescription({ payId: p.id, counterpart: acct(p.other_acct, p.other_id), cents: Math.round(p.amount * 100), label: p.label }),
  }))];
  return { ...data, purchases, merchants, ledger };
}
