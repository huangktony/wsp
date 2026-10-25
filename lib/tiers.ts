// Pure tier rules (no I/O) so lib/analyze.ts and tests can use them without a database.
export type Tier = "$" | "$$" | "$$$";

/** Upper bounds (inclusive) of $ and $$. Anything above the last is $$$. */
export const TIER_CUTOFFS = [12, 30];

export function tierFromAvg(avg: number): Tier {
  return avg <= TIER_CUTOFFS[0] ? "$" : avg <= TIER_CUTOFFS[1] ? "$$" : "$$$";
}
