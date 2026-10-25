// Pure spending analysis: no I/O. The one place that turns Nessie purchases into categories, recent items and a tier,
// so the Spending screen and the group tier cannot disagree.
import { tierFromAvg, type Tier } from "./tiers";

/** The fields we use from a Nessie purchase (see scripts/nessie-probe.ts). */
export type NessiePurchase = { merchant_id: string; purchase_date: string; amount: number; status: string };
export type MerchantInfo = { name: string; category: string };

export const CATEGORIES = ["food", "entertainment", "groceries", "transport", "shopping", "other"] as const;
export type Category = (typeof CATEGORIES)[number];
const FUN: Category[] = ["food", "entertainment"];

/** Used for the tier when there are no fun purchases at all. `usedDefault` tells the caller. */
export const DEFAULT_FUN_AVG = 20;

export const UNKNOWN_MERCHANT = "Unknown merchant";

export type Analysis = {
  categories: { name: Category; total: number }[];
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
 */
export function analyze(purchases: NessiePurchase[], merchantsById: Map<string, MerchantInfo>, days: number, now: Date): Analysis {
  const first = dayString(now.getTime() - (days - 1) * 864e5);
  const rows = purchases
    .filter((p) => p.status !== "cancelled" && p.purchase_date >= first)
    .map((p) => {
      const m = merchantsById.get(p.merchant_id);
      return { date: p.purchase_date, amount: p.amount, merchant: m?.name ?? UNKNOWN_MERCHANT, category: categoryOf(m?.category) };
    });

  const totals = new Map<Category, number>();
  for (const r of rows) totals.set(r.category, (totals.get(r.category) ?? 0) + r.amount);

  const fun = rows.filter((r) => FUN.includes(r.category));
  const usedDefault = fun.length === 0;
  const avgFun = usedDefault ? DEFAULT_FUN_AVG : cents(fun.reduce((s, r) => s + r.amount, 0) / fun.length);

  return {
    categories: [...totals.entries()].map(([name, total]) => ({ name, total: cents(total) })).sort((a, b) => b.total - a.total),
    recent: [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 5),
    spent: cents(rows.reduce((s, r) => s + r.amount, 0)),
    avgFun,
    usedDefault,
    tier: tierFromAvg(avgFun),
    count: rows.length,
  };
}
