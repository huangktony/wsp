// TODO(verify): exact Google Maps response fields (local_results, price, rating, gps_coordinates, hours) against SerpApi docs.
// Verified live: results carry `title`, `type`, `types`, rating, address, but NO price field, so prices are estimated (lib/price.ts).
import { estCost, estimatePlace, rank } from "./price";
import type { Tier } from "./tiers";

export { estCost };
export type Place = {
  name: string; category: string; price: Tier; cost: number; priceEstimated: boolean;
  rating: number; address: string; hours?: string; type?: string;
};

const place = (name: string, category: string, price: Tier, rating: number, address: string, cost = estCost(price)): Place =>
  ({ name, category, price, cost, priceEstimated: true, rating, address });

const MOCK: Record<string, Place[]> = {
  food: [
    place("Torchy's Tacos", "food", "$", 4.5, "2801 Guadalupe St"),
    place("Franklin Barbecue", "food", "$$", 4.8, "900 E 11th St"),
    place("Uchi", "food", "$$$", 4.7, "801 S Lamar Blvd"),
  ],
  coffee: [
    place("Houndstooth Coffee", "coffee", "$", 4.6, "401 Congress Ave"),
    place("Merit Coffee", "coffee", "$", 4.5, "1 Texas Pl"),
  ],
  outdoors: [
    place("Barton Springs Pool", "outdoors", "$", 4.8, "2131 William Barton Dr", 0),
    place("Lady Bird Lake Kayaks", "outdoors", "$$", 4.6, "2418 Stratford Dr"),
  ],
  entertainment: [
    place("Alamo Drafthouse", "entertainment", "$$", 4.6, "320 E 6th St"),
    place("Peter Pan Mini Golf", "entertainment", "$", 4.7, "1207 Barton Springs Rd"),
    place("Emo's Austin", "entertainment", "$$", 4.4, "2015 E Riverside Dr"),
  ],
};

/** The search term depends on the group's budget, so a "$" group searches for cheap places. */
const QUERY: Record<string, Record<Tier, string>> = {
  food: { $: "cheap eats", $$: "restaurants", $$$: "upscale restaurants" },
  entertainment: { $: "free things to do", $$: "things to do", $$$: "nightlife" },
  coffee: { $: "coffee shops", $$: "coffee shops", $$$: "coffee shops" },
  outdoors: { $: "parks", $$: "parks", $$$: "parks" },
};
export const queryFor = (cat: string, tier: Tier): string | undefined => QUERY[cat]?.[tier];
/** Coffee and parks are cheap whatever the group budget; food and entertainment take the tier of their query. */
const queryTierFor = (cat: string, tier: Tier): Tier => (cat === "coffee" || cat === "outdoors" ? "$" : tier);

/** Turns one Google Maps result into a Place with an estimated price. Pure, so it can be tested with fixtures. */
export function placeFromResult(r: any, cat: string, tier: Tier): Place {
  const types: string[] = [r.type, ...(Array.isArray(r.types) ? r.types : [])].filter((t) => typeof t === "string");
  const g = estimatePlace({ queryTier: queryTierFor(cat, tier), types, realPrice: r.price });
  return { name: r.title, category: cat, price: g.price, cost: g.cost, priceEstimated: g.estimated, rating: r.rating ?? 4, address: r.address ?? "", hours: r.hours, type: types[0] };
}

export function categoriesFor(interests: string[]): string[] {
  const picks = interests.filter((i) => QUERY[i]);
  const fallback = ["food", "entertainment", "outdoors"];
  return [...new Set([...picks, ...fallback])].slice(0, 3);
}

export type SearchFn = (cat: string, tier: Tier, lat: number, lng: number) => Promise<Place[]>;

const search: SearchFn = async (cat, tier, lat, lng) => {
  const q = queryFor(cat, tier);
  if (process.env.USE_MOCKS === "true" || !process.env.SERPAPI_KEY || !q) return MOCK[cat] ?? [];
  try {
    const u = new URL("https://serpapi.com/search.json");
    u.search = new URLSearchParams({ engine: "google_maps", q, ll: `@${lat},${lng},14z`, type: "search", api_key: process.env.SERPAPI_KEY }).toString();
    const res = await fetch(u, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const out: Place[] = (data.local_results ?? []).slice(0, 6).map((r: any) => placeFromResult(r, cat, tier));
    return out.length ? out : MOCK[cat] ?? [];
  } catch {
    return MOCK[cat] ?? [];
  }
};

/** HARD RULE: never returns a place above `maxTier`. Fewer places is fine; there is no fallback to over-budget ones. */
export async function findPlaces(cats: string[], lat: number, lng: number, maxTier: string, searchFn: SearchFn = search): Promise<Place[]> {
  const all = (await Promise.all(cats.map((c) => searchFn(c, maxTier as Tier, lat, lng)))).flat();
  // TODO(verify): out-of-range filter needs gps_coordinates distance; the search is already centered on the group.
  return all.filter((p) => rank(p.price) <= rank(maxTier));
}
