// TODO(verify): exact Google Maps response fields (local_results, price, rating, gps_coordinates, hours) against SerpApi docs.
// Verified live: results carry `title`, `type`, `types`, rating, address, but NO price field, so prices are estimated (lib/price.ts).
import { estCost, estimatePlace, rank } from "./price";
import type { Tier } from "./tiers";

export { estCost };
export type Place = {
  name: string; category: string; price: Tier; cost: number; priceEstimated: boolean;
  rating: number; address: string; hours?: string; type?: string;
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

export class PlaceSearchError extends Error {
  constructor() { super("We couldn't search places right now. Try again."); }
}
export class MissingCityError extends Error {
  constructor() { super("Add a city to your group"); }
}
export type Coordinates = { latitude: number; longitude: number };
export type SearchOptions = { fetch?: typeof fetch; sample?: boolean; center?: Coordinates };

function coordinates(value: any): Coordinates | null {
  return value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude)
    && Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180 ? value : null;
}

/** Never propagate provider response bodies, URLs, or fetch errors containing credentials. */
async function maps(params: Record<string, string>, request: typeof fetch) {
  const key = process.env.SERPAPI_KEY?.trim();
  if (!key) throw new PlaceSearchError();
  try {
    const url = new URL("https://serpapi.com/search.json");
    url.search = new URLSearchParams({ engine: "google_maps", type: "search", ...params, api_key: key }).toString();
    const response = await request(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new PlaceSearchError();
    const data = await response.json();
    if (data.error || data.search_metadata?.status === "Error") throw new PlaceSearchError();
    return data;
  } catch { throw new PlaceSearchError(); }
}

export async function geocodeCity(city: string, request: typeof fetch = fetch): Promise<Coordinates> {
  if (!city.trim()) throw new MissingCityError();
  const data = await maps({ q: city.trim() }, request);
  const ll = data.search_parameters?.ll ?? data.search_metadata?.ll;
  const match = typeof ll === "string" ? ll.match(/^@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),/) : null;
  const center = coordinates(data.place_results?.gps_coordinates)
    ?? coordinates(data.local_results?.[0]?.gps_coordinates)
    ?? coordinates(data.search_metadata?.gps_coordinates)
    ?? coordinates(data.search_parameters?.gps_coordinates)
    ?? (match ? coordinates({ latitude: Number(match[1]), longitude: Number(match[2]) }) : null);
  if (!center) throw new PlaceSearchError();
  return center;
}

/** Straight-line miles from the selected city's center. Unknown coordinates are excluded. */
export function distanceMiles(a: Coordinates, b: Coordinates) {
  const radians = (n: number) => n * Math.PI / 180;
  const h = Math.sin(radians(b.latitude - a.latitude) / 2) ** 2
    + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(radians(b.longitude - a.longitude) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

/** No place cache or fallback: every live search is tied to the round's city and category. */
export async function findPlaces(cats: string[], city: string, maxTier: string, maxDistanceMi: number, options: SearchOptions = {}): Promise<Place[]> {
  city = city.trim();
  if (!city) throw new MissingCityError();
  if (!Number.isFinite(maxDistanceMi) || maxDistanceMi <= 0) throw new PlaceSearchError();
  if (options.sample ?? process.env.USE_SAMPLE_PLACES === "true") {
    // Explicit synthetic demo data, never mistaken for real venues or addresses.
    return cats.filter(cat => queryFor(cat, maxTier as Tier)).map(cat => ({
      name: `Sample ${cat} venue`, category: cat, price: "$" as Tier, cost: estCost("$"), priceEstimated: true,
      rating: 0, address: `Sample location in ${city} (not a real venue)`,
    }));
  }
  const request = options.fetch ?? fetch;
  const center = coordinates(options.center) ?? await geocodeCity(city, request);
  const all = (await Promise.all(cats.map(async cat => {
    const query = queryFor(cat, maxTier as Tier);
    if (!query) return [];
    const data = await maps({ q: `${query} in ${city}`, ll: `@${center.latitude},${center.longitude},14z` }, request);
    if (data.local_results != null && !Array.isArray(data.local_results)) throw new PlaceSearchError();
    return (data.local_results ?? []).filter((result: any) => {
      const point = coordinates(result.gps_coordinates);
      return typeof result.title === "string" && point && distanceMiles(center, point) <= maxDistanceMi;
    }).slice(0, 6).map((result: any) => placeFromResult(result, cat, maxTier as Tier));
  }))).flat();
  return all.filter(p => rank(p.price) <= rank(maxTier));
}
