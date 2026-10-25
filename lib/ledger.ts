// Pure helpers for the split-bill ledger kept in Nessie deposits and withdrawals.
// Nessie transfers cannot link two accounts and truncate cents (see scripts/nessie-probe.ts), so a repayment is TWO rows:
// a withdrawal on the person who paid back and a deposit on the person who was paid back. Everything that ties them together
// lives in the description, in a format we control:  WSP split|pay=<paymentId>|acct=<counterpart account id>|cents=<exact>|<label>

const PREFIX = "WSP split|";

export type LedgerEntry = { kind: "in" | "out"; date: string; amount: number; description?: string };
export type SplitMeta = { payId: number; acct: string; cents: number | null; label: string };

const clean = (s: string) => s.replace(/\|/g, "/").replace(/\s+/g, " ").trim().slice(0, 60);

export function splitDescription(m: { payId: number; counterpart: string; cents: number; label: string }): string {
  return `${PREFIX}pay=${m.payId}|acct=${clean(m.counterpart)}|cents=${Math.round(m.cents)}|${clean(m.label)}`;
}

/** Only rows that start with "WSP split|" are ours. Anything else (or a row we cannot read) returns null. */
export function parseSplitDescription(description: string | undefined | null): SplitMeta | null {
  if (!description || !description.startsWith(PREFIX)) return null;
  const parts = description.slice(PREFIX.length).split("|");
  const field = (key: string) => parts.find((p) => p.startsWith(`${key}=`))?.slice(key.length + 1);
  const payId = Number(field("pay"));
  const acct = field("acct");
  if (!Number.isInteger(payId) || payId <= 0 || !acct) return null;
  const rawCents = field("cents");
  const cents = rawCents !== undefined && /^\d+$/.test(rawCents) ? Number(rawCents) : null;
  const label = parts.filter((p) => !/^(pay|acct|cents)=/.test(p)).join("|");
  return { payId, acct, cents, label };
}

/** Dollars for a row: the exact cents from the description, or Nessie's own (whole-dollar) amount if they are missing or garbage. */
export function ledgerDollars(entry: Pick<LedgerEntry, "amount" | "description">): number {
  const m = parseSplitDescription(entry.description);
  return m && m.cents !== null ? m.cents / 100 : entry.amount;
}

/** Which halves of a repayment still need posting. Makes a retry safe: only the missing half is posted. */
export function pendingHalves(withdrawalsOnPayer: { description?: string }[], depositsOnPayee: { description?: string }[], payId: number) {
  const has = (rows: { description?: string }[]) => rows.some((r) => parseSplitDescription(r.description)?.payId === payId);
  return { needWithdrawal: !has(withdrawalsOnPayer), needDeposit: !has(depositsOnPayee) };
}

/** Counterpart account ids found in our rows, so the server can look their names up. */
export function splitAccounts(entries: { description?: string }[]): string[] {
  return [...new Set(entries.map((e) => parseSplitDescription(e.description)?.acct).filter((a): a is string => !!a))];
}
