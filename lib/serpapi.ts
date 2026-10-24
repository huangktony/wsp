// TODO(verify): exact Google Maps response fields (local_results, price, rating, gps_coordinates, hours) against SerpApi docs.
export type Place = { name: string; category: string; price: "$" | "$$" | "$$$"; rating: number; address: string; hours?: string };

const COST: Record<string, number> = { $: 12, $$: 25, $$$: 50 };
export const estCost = (p: string) => COST[p] ?? 25;

const MOCK: Record<string, Place[]> = {
  food: [
    { name: "Torchy's Tacos", category: "food", price: "$", rating: 4.5, address: "2801 Guadalupe St" },
    { name: "Franklin Barbecue", category: "food", price: "$$", rating: 4.8, address: "900 E 11th St" },
    { name: "Uchi", category: "food", price: "$$$", rating: 4.7, address: "801 S Lamar Blvd" },
  ],
  coffee: [
    { name: "Houndstooth Coffee", category: "coffee", price: "$", rating: 4.6, address: "401 Congress Ave" },
    { name: "Merit Coffee", category: "coffee", price: "$", rating: 4.5, address: "1 Texas Pl" },
  ],
  outdoors: [
    { name: "Barton Springs Pool", category: "outdoors", price: "$", rating: 4.8, address: "2131 William Barton Dr" },
    { name: "Lady Bird Lake Kayaks", category: "outdoors", price: "$$", rating: 4.6, address: "2418 Stratford Dr" },
  ],
  entertainment: [
    { name: "Alamo Drafthouse", category: "entertainment", price: "$$", rating: 4.6, address: "320 E 6th St" },
    { name: "Peter Pan Mini Golf", category: "entertainment", price: "$", rating: 4.7, address: "1207 Barton Springs Rd" },
    { name: "Emo's Austin", category: "entertainment", price: "$$", rating: 4.4, address: "2015 E Riverside Dr" },
  ],
};
const QUERY: Record<string, string> = { food: "restaurants", coffee: "coffee shops", outdoors: "parks", entertainment: "things to do" };

export function categoriesFor(interests: string[]): string[] {
  const picks = interests.filter((i) => QUERY[i]);
  const fallback = ["food", "entertainment", "outdoors"];
  return [...new Set([...picks, ...fallback])].slice(0, 3);
}

async function search(cat: string, lat: number, lng: number): Promise<Place[]> {
  if (process.env.USE_MOCKS === "true" || !process.env.SERPAPI_KEY) return MOCK[cat] ?? [];
  try {
    const u = new URL("https://serpapi.com/search.json");
    u.search = new URLSearchParams({ engine: "google_maps", q: QUERY[cat], ll: `@${lat},${lng},14z`, type: "search", api_key: process.env.SERPAPI_KEY }).toString();
    const res = await fetch(u, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const out: Place[] = (data.local_results ?? []).slice(0, 6).map((r: any) => ({
      name: r.title, category: cat, rating: r.rating ?? 4, address: r.address ?? "",
      price: (["$", "$$", "$$$"].includes(r.price) ? r.price : "$$") as Place["price"], hours: r.hours,
    }));
    return out.length ? out : MOCK[cat] ?? [];
  } catch {
    return MOCK[cat] ?? [];
  }
}

export async function findPlaces(cats: string[], lat: number, lng: number, maxTier: string): Promise<Place[]> {
  const rank = (t: string) => t.length;
  const all = (await Promise.all(cats.map((c) => search(c, lat, lng)))).flat();
  // TODO(verify): out-of-range filter needs gps_coordinates distance; the search is already centered on the group.
  const ok = all.filter((p) => rank(p.price) <= rank(maxTier));
  return ok.length >= 3 ? ok : all.slice(0, 6);
}
