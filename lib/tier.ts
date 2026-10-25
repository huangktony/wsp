// Server only. Raw purchases never leave this module except to the owner via /api/me/spending.
import { q, q1 } from "./db";
import { loadSpending, type SpendingData } from "./nessie";
import { analyze } from "./analyze";
import { TIER_CUTOFFS, tierFromAvg, type Tier } from "./tiers";

export { TIER_CUTOFFS, tierFromAvg };
export type { Tier };
const ORDER: Tier[] = ["$", "$$", "$$$"];

export const lowestTier = (tiers: (string | null)[]): Tier =>
  tiers.filter((t): t is Tier => !!t && ORDER.includes(t as Tier)).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))[0] ?? "$$";

/** Always 30 days. Pass `data` when the caller already loaded it, so one request fetches once. */
export async function computeTier(userId: number, accountId: string | null, data?: SpendingData) {
  const d = data ?? (await loadSpending(accountId));
  const a = analyze(d.purchases, d.merchants, 30, new Date());
  await q("update users set budget_tier=$1, avg_outing_cost=$2 where id=$3", [a.tier, a.avgFun, userId]);
  return { tier: a.tier, avg: a.avgFun, usedDefault: a.usedDefault };
}
export async function groupTier(groupId: number): Promise<Tier> {
  const rows = await q<{ budget_tier: string | null }>("select u.budget_tier from memberships m join users u on u.id=m.user_id where m.group_id=$1", [groupId]);
  return lowestTier(rows.map((r) => r.budget_tier));
}
export { q1 };
