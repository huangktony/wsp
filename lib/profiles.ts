// Pure demo spender profiles (no I/O): how much a demo account spends and starts with.
// Ranges are whole dollars (Nessie truncates amounts) and chosen to sit fully inside one tier for TIER_CUTOFFS [12, 30].
export const PROFILES = ["frugal", "average", "big"] as const;
export type Spender = (typeof PROFILES)[number];

export const PROFILE_LABELS: Record<Spender, string> = { frugal: "Frugal", average: "Average", big: "Big spender" };

/**
 * Fun (food and entertainment) price band per merchant, per profile, in whole dollars. A merchant a profile does not
 * list is a merchant that profile never visits. Every band sits fully inside the profile's tier for TIER_CUTOFFS [12, 30]:
 * frugal 11 or less ($), average 14 to 28 ($$), big 32 or more ($$$).
 */
export const FUN_BANDS: Record<Spender, Record<string, [number, number]>> = {
  frugal: { "Jeni's Ice Cream": [5, 9], "Torchy's Tacos": [8, 11], "Barton Springs Mini Golf": [9, 11] },
  average: {
    "Jeni's Ice Cream": [14, 18], "Torchy's Tacos": [14, 20], "Barton Springs Mini Golf": [14, 18],
    "Alamo Drafthouse": [18, 28], "Franklin Barbecue": [20, 28], "Emo's Austin": [20, 28],
  },
  big: {
    "Jeni's Ice Cream": [32, 40], "Torchy's Tacos": [32, 42], "Barton Springs Mini Golf": [32, 40],
    "Alamo Drafthouse": [35, 55], "Franklin Barbecue": [40, 60], "Emo's Austin": [40, 60],
  },
};

/** How often a profile visits each merchant it can visit. Big spenders lean toward the pricier places. */
const VISIT_WEIGHT: Record<Spender, Record<string, number>> = {
  frugal: {},
  average: {},
  big: { "Alamo Drafthouse": 2, "Franklin Barbecue": 3, "Emo's Austin": 3 },
};

/** Everyday spending, scaled by profile. These never count toward the fun average. */
export const OTHER_MERCHANTS: { name: string; category: "groceries" | "transport" | "shopping" }[] = [
  { name: "H-E-B", category: "groceries" },
  { name: "Uber", category: "transport" },
  { name: "Target", category: "shopping" },
  { name: "BookPeople", category: "shopping" },
];
export const OTHER_BANDS: Record<Spender, Record<"groceries" | "transport" | "shopping", [number, number]>> = {
  frugal: { groceries: [20, 45], shopping: [10, 35], transport: [6, 15] },
  average: { groceries: [35, 80], shopping: [20, 80], transport: [8, 25] },
  big: { groceries: [60, 150], shopping: [50, 200], transport: [15, 45] },
};

export const FUN_COUNT = 16, OTHER_COUNT = 7, CANCELLED_COUNT = 2, CANCELLED_AMOUNT = 95;
export type PlannedPurchase = { merchant: string; amount: number; status: "completed" | "cancelled"; daysAgo: number };

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

/**
 * The purchases to seed for a user: 16 fun, 7 everyday, plus 2 cancelled with a big amount (so a missing status filter
 * would visibly change the tier). Pure and deterministic per user and profile. `daysAgo` is 0 to 28.
 */
export function planPurchases(userId: number, profile: Spender): PlannedPurchase[] {
  const r = rng(userId * 7919 + 13);
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const funNames = Object.keys(FUN_BANDS[profile]);
  const weights = funNames.map((n) => VISIT_WEIGHT[profile][n] ?? 1);
  const total = weights.reduce((a, b) => a + b, 0);
  const pickFun = () => {
    let t = r() * total;
    for (let i = 0; i < funNames.length; i++) { t -= weights[i]; if (t < 0) return funNames[i]; }
    return funNames[funNames.length - 1];
  };
  const out: PlannedPurchase[] = [];
  for (let i = 0; i < FUN_COUNT; i++) {
    const m = pickFun();
    const [lo, hi] = FUN_BANDS[profile][m];
    out.push({ merchant: m, amount: int(lo, hi), status: "completed", daysAgo: int(0, 28) });
  }
  for (let i = 0; i < OTHER_COUNT; i++) {
    const m = OTHER_MERCHANTS[int(0, OTHER_MERCHANTS.length - 1)];
    const [lo, hi] = OTHER_BANDS[profile][m.category];
    out.push({ merchant: m.name, amount: int(lo, hi), status: "completed", daysAgo: int(0, 28) });
  }
  for (let i = 0; i < CANCELLED_COUNT; i++) out.push({ merchant: funNames[int(0, funNames.length - 1)], amount: CANCELLED_AMOUNT, status: "cancelled", daysAgo: int(0, 28) });
  return out;
}
