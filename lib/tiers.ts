// Pure tier rules (no I/O) so lib/analyze.ts and tests can use them without a database.
export type Tier = "$" | "$$" | "$$$";

/** Upper bounds (inclusive) of $ and $$. Anything above the last is $$$. */
export const TIER_CUTOFFS = [12, 30];

export function tierFromAvg(avg: number): Tier {
  return avg <= TIER_CUTOFFS[0] ? "$" : avg <= TIER_CUTOFFS[1] ? "$$" : "$$$";
}

const ORDER: Tier[] = ["$", "$$", "$$$"];
export const isTier = (t: unknown): t is Tier => typeof t === "string" && ORDER.includes(t as Tier);

/** The lowest valid tier in the list. Nulls are ignored; with none left it is "$$" (the existing default). */
export const lowestTier = (tiers: (string | null | undefined)[]): Tier =>
  tiers.filter(isTier).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))[0] ?? "$$";

/**
 * The one wording for a group's budget level, used on every screen a group can see:
 * "$" -> "up to $12 / person", "$$" -> "up to $30 / person", "$$$" -> "$30+ / person".
 * Fixed ranges only. Never show a member's real spending here.
 */
export const tierLabel = (t: Tier): string =>
  t === "$" ? `up to $${TIER_CUTOFFS[0]} / person` : t === "$$" ? `up to $${TIER_CUTOFFS[1]} / person` : `$${TIER_CUTOFFS[1]}+ / person`;
