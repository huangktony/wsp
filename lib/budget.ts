// Pure numbers for the Budget screen. Honest by construction: Nessie never moves a balance and there is no debt source, so
// the balance is the account's STARTING balance adjusted day by day by the same signed transactions analyze() produced.

export type SignedTx = { date: string; amount: number };
export type SeriesPoint = { date: string; value: number };

const cents = (n: number) => Math.round(n * 100) / 100;
const dayString = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * One point per day for the last `days` days (oldest first, today last). Each value is the starting balance plus every signed
 * transaction dated on or before that day: purchases and paybacks you made are negative, paybacks you received are positive.
 * Pass analyze().transactions so the rows (window, cancelled, future dates) are exactly the ones the rest of the screen uses.
 */
export function balanceSeries(startingBalance: number, transactions: SignedTx[], days: number, now: Date): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = dayString(now.getTime() - i * 864e5);
    const moved = transactions.filter((t) => t.date <= date).reduce((s, t) => s + t.amount, 0);
    out.push({ date, value: cents(startingBalance + moved) });
  }
  return out;
}

/** What this user still owes: the sum of their payment rows that are 'owed'. */
export function sumOwed(rows: { amount: number; status: string }[]): number {
  return cents(rows.filter((r) => r.status === "owed").reduce((s, r) => s + r.amount, 0));
}

/**
 * Hero numbers. Net position = balance today minus what you owe now. `change` is the move in balance across the window; we have
 * no history of what was owed, so it is not claimed to be a change in net position beyond that.
 */
export function budgetSummary(p: { startingBalance: number; transactions: SignedTx[]; owe: number; days: number; now: Date }) {
  const series = balanceSeries(p.startingBalance, p.transactions, p.days, p.now);
  const balance = series[series.length - 1].value;
  return { series, balance, owe: p.owe, net: cents(balance - p.owe), change: cents(balance - p.startingBalance) };
}
