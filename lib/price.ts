// Pure price rules (no I/O). SerpApi's Google Maps results carry no price field in practice (0 of 60 in a live check),
// so a place's price is ESTIMATED from the search that found it and from its Google Maps `types`.
import type { Tier } from "./tiers";

const COST: Record<string, number> = { $: 12, $$: 25, $$$: 50 };
export const estCost = (p: string) => COST[p] ?? 25;
/** "$" is 1 ... "$$$" is 3. */
export const rank = (t: string) => t.length;

export type PriceGuess = { price: Tier; cost: number; estimated: boolean };

// Types that mean a place is free. Blocked if any type says it is a paid venue (a "Beer garden" is not free).
const FREE = /\b(park|hiking area|scenic spot|nature preserve|plaza|historical landmark|garden)\b/;
const NOT_FREE = /\b(restaurant|bar|pub|brewery|beer|cafe|coffee|shop|store|club|theater|cinema|amusement|water park|theme park|trampoline)\b/;
const CHEAP = /\b(taco|fast food|hamburger|hot dog|food truck|coffee shop|cafe|ice cream|bakery|donut|sandwich)\b/;
const PRICEY = /\b(steak house|steakhouse|fine dining|sushi|cocktail bar|wine bar)\b/;

/** A real price from SerpApi if it ever sends one: "$".."$$$$", or "$10-20" / "$25" style (mapped by midpoint against 12/25/50). */
export function parseRealPrice(raw: unknown): Tier | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const s = String(raw).trim();
  if (/^\${1,4}$/.test(s)) return (s.length >= 3 ? "$$$" : s) as Tier;
  const nums = s.match(/\d+(?:\.\d+)?/g)?.map(Number);
  if (!nums?.length) return null;
  const mid = nums.length > 1 ? (nums[0] + nums[1]) / 2 : nums[0];
  return mid <= 18.5 ? "$" : mid <= 37.5 ? "$$" : "$$$";
}

/**
 * Start from the tier of the query that found the place, then adjust from its types.
 * When types disagree we lean toward the HIGHER price, so an expensive place is never understated.
 */
export function estimatePlace(input: { queryTier: Tier; types: string[]; realPrice?: unknown }): PriceGuess {
  const real = parseRealPrice(input.realPrice);
  if (real) return { price: real, cost: estCost(real), estimated: false };
  const ts = input.types.map((t) => t.toLowerCase());
  const any = (re: RegExp) => ts.some((t) => re.test(t));
  if (any(FREE) && !any(NOT_FREE)) return { price: "$", cost: 0, estimated: true };
  if (any(PRICEY)) {
    const price: Tier = rank(input.queryTier) >= 2 ? input.queryTier : "$$";
    return { price, cost: estCost(price), estimated: true };
  }
  if (any(CHEAP)) return { price: "$", cost: estCost("$"), estimated: true };
  return { price: input.queryTier, cost: estCost(input.queryTier), estimated: true };
}

/**
 * A plan's level is the price of its most expensive stop. A stop with no known price counts as the most expensive ("$$$"),
 * never the cheapest, so an unpriced stop can never make a plan look like it fits a small budget.
 */
export function planLevel(stops: { price?: string }[]): Tier {
  const top = Math.max(1, ...stops.map((s) => (s.price ? rank(s.price) : 3)));
  return (top >= 3 ? "$$$" : top === 2 ? "$$" : "$") as Tier;
}
