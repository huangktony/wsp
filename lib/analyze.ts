// Pure spending analysis: no I/O. The one place that turns Nessie purchases into categories, recent items and a tier,
// so the Spending screen and the group tier cannot disagree.
import { tierFromAvg, type Tier } from "./tiers";
import { ledgerDollars, parseSplitDescription, type LedgerEntry } from "./ledger";

/** The fields we use from a Nessie purchase (see scripts/nessie-probe.ts). */
export type NessiePurchase = { merchant_id: string; purchase_date: string; amount: number; status: string };
export type MerchantInfo = { name: string; category: string };

// "hangout" is the up-front split bill. It counts as spending but is never "fun", so it cannot move a budget tier.
export const CATEGORIES = ["food", "entertainment", "groceries", "transport", "shopping", "hangout", "other"] as const;
export type Category = (typeof CATEGORIES)[number];
const FUN: Category[] = ["food", "entertainment"];

/** Used for the tier when there are no fun purchases at all. `usedDefault` tells the caller. */
export const DEFAULT_FUN_AVG = 20;

export const UNKNOWN_MERCHANT = "Unknown merchant";

/** One line of the Transactions list. `amount` is signed: purchases and paybacks you made are negative, paybacks to you are positive. */
export type Transaction = { date: string; label: string; amount: number; kind: "purchase" | "paid_back" | "paid_you_back" };

export const PAID_BACK_CATEGORY = "paid back";
export const UNKNOWN_FRIEND = "a friend";

export type Analysis = {
  categories: { name: Category | typeof PAID_BACK_CATEGORY; total: number }[];
  transactions: Transaction[];
  /** Dollars friends paid back to this account within the window. */
  paidBackToYou: number;
  recent: { date: string; merchant: string; amount: number; category: Category }[];
  spent: number;
  avgFun: number;
  usedDefault: boolean;
  tier: Tier;
  count: number;
};

export function categoryOf(raw: string | undefined | null): Category {
  const c = (raw ?? "").trim().toLowerCase();
  return (CATEGORIES as readonly string[]).includes(c) && c !== "other" ? (c as Category) : "other";
}

const cents = (n: number) => Math.round(n * 100) / 100;
const dayString = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Window: exactly `days` calendar days in UTC, from (today - (days - 1)) through today, inclusive.
 * For days = 30 a purchase dated 29 days ago counts and one dated 30 days ago does not.
 * Purchases dated after today are ignored too: Nessie keeps whatever date it is sent. The same window applies to ledger rows.
 *
 * `ledger` holds this account's Nessie deposits and withdrawals. Only rows written by WSP ("WSP split|...") are read: a withdrawal
 * is a payback you made (counts toward `spent`), a deposit is a payback to you (`paidBackToYou`, never `spent`). Neither touches the tier.
 * `names` maps a counterpart account id to a display name; anyone not in it is shown as "a friend". Raw descriptions and account
 * ids never appear in the result.
 */
export function analyze(
  purchases: NessiePurchase[], merchantsById: Map<string, MerchantInfo>, days: number, now: Date,
  ledger: LedgerEntry[] = [], names: Map<string, string> = new Map(),
): Analysis {
  const first = dayString(now.getTime() - (days - 1) * 864e5);
  const today = dayString(now.getTime());
  const rows = purchases
    .filter((p) => p.status !== "cancelled" && p.purchase_date >= first && p.purchase_date <= today)
    .map((p) => {
      const m = merchantsById.get(p.merchant_id);
      return { date: p.purchase_date, amount: p.amount, merchant: m?.name ?? UNKNOWN_MERCHANT, category: categoryOf(m?.category) };
    });

  const totals = new Map<Category | typeof PAID_BACK_CATEGORY, number>();
  for (const r of rows) totals.set(r.category, (totals.get(r.category) ?? 0) + r.amount);

  const paybacks = ledger
    .filter((e) => e.date >= first && e.date <= today)
    .flatMap((e): Transaction[] => {
      const meta = parseSplitDescription(e.description);
      if (!meta) return [];
      const name = names.get(meta.acct) ?? UNKNOWN_FRIEND;
      const dollars = ledgerDollars(e);
      return e.kind === "out"
        ? [{ date: e.date, label: `Paid back ${name}`, amount: -dollars, kind: "paid_back" }]
        : [{ date: e.date, label: `${name} paid you back`, amount: dollars, kind: "paid_you_back" }];
    });
  const paidOut = paybacks.filter((t) => t.kind === "paid_back").reduce((s, t) => s - t.amount, 0);
  if (paidOut > 0) totals.set(PAID_BACK_CATEGORY, paidOut);
  const transactions: Transaction[] = [...rows.map((r) => ({ date: r.date, label: r.merchant, amount: -r.amount, kind: "purchase" as const })), ...paybacks]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map((t) => ({ ...t, amount: cents(t.amount) }));

  const fun = rows.filter((r) => FUN.includes(r.category));
  const usedDefault = fun.length === 0;
  const avgFun = usedDefault ? DEFAULT_FUN_AVG : cents(fun.reduce((s, r) => s + r.amount, 0) / fun.length);

  return {
    categories: [...totals.entries()].map(([name, total]) => ({ name, total: cents(total) })).sort((a, b) => b.total - a.total),
    transactions,
    paidBackToYou: cents(paybacks.filter((t) => t.kind === "paid_you_back").reduce((s, t) => s + t.amount, 0)),
    recent: [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 5),
    spent: cents(rows.reduce((s, r) => s + r.amount, 0) + paidOut),
    avgFun,
    usedDefault,
    tier: tierFromAvg(avgFun),
    count: rows.length,
  };
}
