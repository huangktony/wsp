// Server only. Raw purchases never leave this module except to the owner via /api/me/spending.
import { q, q1 } from "./db";
import { getPurchases } from "./nessie";

export type Tier = "$" | "$$" | "$$$";
const ORDER: Tier[] = ["$", "$$", "$$$"];
const FUN = ["food", "entertainment"];

export function tierFromAvg(avg: number): Tier {
  return avg <= 12 ? "$" : avg <= 30 ? "$$" : "$$$";
}
export const lowestTier = (tiers: (string | null)[]): Tier =>
  tiers.filter((t): t is Tier => !!t && ORDER.includes(t as Tier)).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))[0] ?? "$$";

export async function computeTier(userId: number, accountId: string | null) {
  const purchases = (await getPurchases(accountId, 30)).filter((p) => FUN.includes(p.category));
  const avg = purchases.length ? purchases.reduce((s, p) => s + p.amount, 0) / purchases.length : 20;
  const tier = tierFromAvg(avg);
  await q("update users set budget_tier=$1, avg_outing_cost=$2 where id=$3", [tier, Math.round(avg * 100) / 100, userId]);
  return { tier, avg };
}
export async function groupTier(groupId: number): Promise<Tier> {
  const rows = await q<{ budget_tier: string | null }>("select u.budget_tier from memberships m join users u on u.id=m.user_id where m.group_id=$1", [groupId]);
  return lowestTier(rows.map((r) => r.budget_tier));
}
export { q1 };
