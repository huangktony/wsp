import type { Block } from "./availability";
// Google Maps fields are optional: validate coordinates and prices before treating a venue as eligible.
import { estCost, estimatePlace, parseRealPrice, rank, type PriceLevel } from "./price";
import type { Tier } from "./tiers";

export { estCost };
export type Place = {
  name: string; category: string; price: PriceLevel; cost: number; priceEstimated: boolean;
  reviews?: number; distanceMi?: number; searchRadiusMi?: number; radiusNote?: string;
  rating: number; address: string; hours?: string; type?: string; types?: string[];
};

/** The search term depends on the group's budget, so a "$" group searches for cheap places. */
const QUERY: Record<string, Record<Tier, string>> = {
  food: { $: "cheap eats", $$: "restaurants", $$$: "upscale restaurants" },
  entertainment: { $: "free things to do", $$: "things to do", $$$: "nightlife" },
  coffee: { $: "coffee shops", $$: "coffee shops", $$$: "coffee shops" },
  "indoor games": { $: "arcade", $$: "bowling arcade", $$$: "escape rooms" },
  nightlife: { $: "live music free entry", $$: "live music bars", $$$: "cocktail bars" },
  creative: { $: "free art galleries", $$: "pottery painting", $$$: "art workshops" },
  outdoors: { $: "parks", $$: "parks", $$$: "parks" },
  music: { $: "free live music", $$: "live music venues", $$$: "concert venues" },
  games: { $: "board game cafes", $$: "bowling arcade", $$$: "escape rooms" },
  sports: { $: "public sports courts", $$: "sports activities", $$$: "sports venues" },
  "art & museums": { $: "free museums art galleries", $$: "museums art galleries", $$$: "museums art workshops" },
  shopping: { $: "thrift stores markets", $$: "shopping boutiques", $$$: "shopping malls boutiques" },
  movies: { $: "discount movie theaters", $$: "movie theaters", $$$: "premium movie theaters" },
  fitness: { $: "free outdoor fitness", $$: "fitness classes", $$$: "fitness studios" },
};
export const queryFor = (cat: string, tier: PriceLevel): string | undefined => QUERY[cat]?.[tier === "$$$$" ? "$$$" : tier];
/** Coffee and parks are cheap whatever the group budget; food and entertainment take the tier of their query. */
const queryTierFor = (cat: string, tier: PriceLevel): Tier => (cat === "coffee" || cat === "outdoors" ? "$" : tier === "$$$$" ? "$$$" : tier);

/** Turns one Google Maps result into a Place with an estimated price. Pure, so it can be tested with fixtures. */
export function placeFromResult(r: any, cat: string, tier: PriceLevel): Place {
  const types: string[] = [r.type, ...(Array.isArray(r.types) ? r.types : [])].filter((t) => typeof t === "string");
  const g = estimatePlace({ queryTier: queryTierFor(cat, tier), types, realPrice: r.price });
  return { name: r.title, category: cat, price: g.price, cost: g.cost, priceEstimated: g.estimated, rating: Number(r.rating) || 0, reviews: Number(String(r.reviews ?? 0).replace(/,/g, "")) || 0, address: r.address ?? "", hours: r.hours, type: types[0], types };
}

export function categoriesFor(interests: string[]): string[] {
  const picks = interests.filter((i) => QUERY[i]);
  const fallback = ["food", "entertainment", "outdoors"];
  return [...new Set(picks.length ? picks : fallback)];
}

export class PlaceSearchError extends Error {
  constructor() { super("We couldn't search places right now. Try again."); }
}
export class MissingCityError extends Error {
  constructor() { super("Add a city to your group"); }
}
export type Coordinates = { latitude: number; longitude: number };
export type SearchOptions = { timeBlock?: Block; timeWindow?: {date:string;start:number;end:number;planStart:number}; fetch?: typeof fetch; sample?: boolean; center?: Coordinates };

function coordinates(value: any): Coordinates | null {
  return value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude)
    && Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180 ? value : null;
}

const CACHE_TTL = 12 * 60 * 60 * 1000;
// Separate injected transports keep tests isolated; each production process has a bounded cache.
const caches = new WeakMap<typeof fetch, Map<string, { expires: number; value: Promise<any> }>>();

/** Never propagate provider response bodies, URLs, or fetch errors containing credentials. */
async function maps(params: Record<string, string>, request: typeof fetch) {
  const key = process.env.SERPAPI_KEY?.trim();
  if (!key) throw new PlaceSearchError();
  const safeParams = { engine: "google_maps", type: "search", ...params };
  const cacheKey = JSON.stringify(Object.entries(safeParams).sort(([a], [b]) => a.localeCompare(b)));
  let cache = caches.get(request);
  if (!cache) { cache = new Map(); caches.set(request, cache); }
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.value;
  cache.delete(cacheKey);
  if (cache.size >= 256) cache.delete(cache.keys().next().value!);
  const value = (async () => {
    try {
      const url = new URL("https://serpapi.com/search.json");
      url.search = new URLSearchParams({ ...safeParams, api_key: key }).toString();
      const response = await request(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new PlaceSearchError();
      const data = await response.json();
      if (data.error || data.search_metadata?.status === "Error") throw new PlaceSearchError();
      if (data.local_results != null && !Array.isArray(data.local_results)) throw new PlaceSearchError();
      return data;
    } catch { cache!.delete(cacheKey); throw new PlaceSearchError(); }
  })();
  cache.set(cacheKey, { expires: Date.now() + CACHE_TTL, value });
  return value;
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

/** Zoom approximates the viewport, not a radius. GPS filtering below is authoritative. */
export const zoomForMiles = (mi: number) => mi <= 1 ? 15 : mi <= 2 ? 14 : mi <= 5 ? 13 : mi <= 10 ? 12 : mi <= 20 ? 11 : 10;
const nextRadius = (mi: number) => mi <= 1 ? 2 : mi <= 2 ? 5 : mi <= 5 ? 10 : mi <= 10 ? 20 : mi <= 20 ? 40 : mi * 2;

function budgetAllowed(raw: any, place: Place, tier: string) {
  // At $ do not invent prices for restaurants/paid venues. Only clearly free outdoor
  // types, explicit free-admission museums/galleries, and normally cheap coffee shops qualify.
  if (tier === "$" && !parseRealPrice(raw.price)) {
    const types = [raw.type, ...(Array.isArray(raw.types) ? raw.types : [])].join(" ").toLowerCase();
    const freeMuseum = /museum|gallery/.test(types) && raw.free_admission === true;
    if (!(place.cost === 0 || freeMuseum || (/coffee shop|cafe/.test(types) && !/restaurant/.test(types)))) return false;
    if (freeMuseum) { place.price = "$"; place.cost = 0; }
  }
  return rank(place.price) <= rank(tier);
}

/** Every request is scoped by city/query/zoom/page; budgets and radii are always re-filtered. */
export async function findPlaces(cats: string[], city: string, maxTier: string, maxDistanceMi: number, options: SearchOptions = {}): Promise<Place[]> {
  city = city.trim();
  if (!city) throw new MissingCityError();
  if (!Number.isFinite(maxDistanceMi) || maxDistanceMi <= 0) throw new PlaceSearchError();
  if (options.sample ?? process.env.USE_SAMPLE_PLACES === "true") {
    // Explicit synthetic demo data, never mistaken for real venues or addresses.
    return cats.filter(cat => queryFor(cat, maxTier as PriceLevel)).map(cat => ({
      name: `Sample ${cat} venue`, category: cat, price: "$" as Tier, cost: estCost("$"), priceEstimated: true,
      rating: 0, address: `Sample location in ${city} (not a real venue)`,
    }));
  }
  const request = options.fetch ?? fetch;
  const center = coordinates(options.center) ?? await geocodeCity(city, request);
  const categories = [...new Set(cats)].filter(cat => queryFor(cat, maxTier as PriceLevel));
  const results: { raw: any; cat: string }[] = [];
  const filter = (radius: number) => {
    const unique = new Map<string, Place>();
    for (const { raw, cat } of results) {
      const point = coordinates(raw.gps_coordinates);
      if (typeof raw.title !== "string" || !point) continue;
      const miles = distanceMiles(center, point);
      if (miles > radius) continue;
      const place = placeFromResult(raw, cat, maxTier as PriceLevel);
      if (!budgetAllowed(raw, place, maxTier)) continue;
      if ((options.timeBlock === 'evening' || options.timeBlock === 'late-night') && /\b(breakfast|brunch)\b/i.test([place.name, place.type, ...(place.types ?? [])].join(' '))) continue;
      const id = raw.place_id ?? raw.data_id ?? `${place.name.toLowerCase()}|${place.address.toLowerCase()}`;
      if (!unique.has(id)) unique.set(id, { ...place, distanceMi: miles });
    }
    return [...unique.values()];
  };
  const search = async (cat: string, radius: number, start: number) => {
    const params = { q: `${queryFor(cat, maxTier as PriceLevel)}${options.timeBlock ? ` ${options.timeBlock === "evening" && cat === "food" ? "evening dinner" : options.timeBlock.replace("-", " ")}` : ""} in ${city}`, ll: `@${center.latitude},${center.longitude},${zoomForMiles(radius)}z`, start: String(start) };
    const data = await maps(params, request);
    const raw: any[] = data.local_results ?? [];
    results.push(...raw.map(raw => ({ raw, cat })));
    if (process.env.NODE_ENV !== "production") {
      const nearby = raw.filter(r => coordinates(r.gps_coordinates) && distanceMiles(center, r.gps_coordinates) <= radius);
      const affordable = nearby.filter(r => typeof r.title === "string" && budgetAllowed(r, placeFromResult(r, cat, maxTier as PriceLevel), maxTier));
      console.info("[places]", JSON.stringify({ engine: "google_maps", type: "search", ...params, radiusMi: radius, tier: maxTier, raw: raw.length, afterDistance: nearby.length, afterBudget: affordable.length }));
    }
  };
  await Promise.all(categories.map(cat => search(cat, maxDistanceMi, 0)));
  // Google Maps returns up to 20 per page. At most one second page per query,
  // and only while fewer than eight distinct candidates survive all filters.
  for (const cat of categories) if (filter(maxDistanceMi).length < 8) await search(cat, maxDistanceMi, 20);
  let radius = maxDistanceMi;
  let found = filter(radius);
  if (found.length < 3) {
    const limit = nextRadius(maxDistanceMi);
    // At most one wider viewport request per category; expand the hard radius in two steps.
    await Promise.all(categories.map(cat => search(cat, limit, 0)));
    for (const step of [(maxDistanceMi + limit) / 2, limit]) {
      const wider = filter(step);
      if (wider.length > found.length) { found = wider; radius = step; }
      if (found.length >= 3) break;
    }
  }
  const note = radius > maxDistanceMi
    ? `Only a few places fit within ${maxDistanceMi} mi; the search was expanded to ${radius} mi from ${city}.` : undefined;
  // Rating first, then review count, with a small random tie-break for equally ranked candidates.
  return found.map(place => ({ place, tie: Math.random() }))
    .sort((a, b) => b.place.rating - a.place.rating || (b.place.reviews ?? 0) - (a.place.reviews ?? 0) || a.tie - b.tie)
    .slice(0, 24).map(({ place }) => ({ ...place, searchRadiusMi: radius, radiusNote: note }));
}
