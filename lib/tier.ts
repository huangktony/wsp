// Server only. Raw purchases never leave this module except to the owner via /api/me/spending.
import { q, q1 } from "./db";
import { loadSpending, type SpendingData } from "./nessie";
import { analyze } from "./analyze";
import { TIER_CUTOFFS, lowestTier, tierFromAvg, type Tier } from "./tiers";
import { groupTierFrom } from "./comfort";

export { TIER_CUTOFFS, lowestTier, tierFromAvg };
export type { Tier };

/** Always 30 days. Pass `data` when the caller already loaded it, so one request fetches once. */
export async function computeTier(userId: number, accountId: string | null, data?: SpendingData) {
  const d = data ?? (await loadSpending(accountId));
  const a = analyze(d.purchases, d.merchants, 30, new Date());
  await q("update users set budget_tier=$1, avg_outing_cost=$2 where id=$3", [a.tier, a.avgFun, userId]);
  return { tier: a.tier, avg: a.avgFun, usedDefault: a.usedDefault };
}
/** The group's cap: the lowest effective comfort level across members (their pick for this group, else their spending-based tier). */
export async function groupTier(groupId: number): Promise<Tier> {
  const rows = await q<{ comfort_tier: string | null; budget_tier: string | null }>(
    "select m.comfort_tier, u.budget_tier from memberships m join users u on u.id=m.user_id where m.group_id=$1", [groupId]);
  return groupTierFrom(rows);
}
export { q1 };
