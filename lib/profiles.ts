// Pure demo spender profiles (no I/O): how much a demo account spends and starts with.
// Ranges are whole dollars (Nessie truncates amounts) and chosen to sit fully inside one tier for TIER_CUTOFFS [12, 30].
export const PROFILES = ["frugal", "average", "big"] as const;
export type Spender = (typeof PROFILES)[number];

export const PROFILE_LABELS: Record<Spender, string> = { frugal: "Frugal", average: "Average", big: "Big spender" };

/** Fun (food and entertainment) purchase amounts per profile: frugal is all $, average all $$, big all $$$. */
export const FUN_RANGE: Record<Spender, [number, number]> = { frugal: [5, 11], average: [14, 28], big: [32, 60] };

/** Starting account balance per profile. */
export const BALANCE_RANGE: Record<Spender, [number, number]> = { frugal: [300, 1200], average: [1500, 4000], big: [5000, 15000] };

export function rng(seed: number) {
  let a = seed + 0x6d2b79f5;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Whole-dollar starting balance, deterministic per user and profile. */
export function startingBalance(profile: Spender, userId: number): number {
  const [lo, hi] = BALANCE_RANGE[profile];
  return lo + Math.floor(rng(userId * 104729 + 31)() * (hi - lo + 1));
}
