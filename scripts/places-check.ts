// Usage: npm run places:check -- '$'   (or '$$', '$$$')
// Runs the real place search (3 SerpApi credits) and plan generation for a group of that tier, then prints every stop with its
// Google Maps type, estimated price and cost. Places without a type came from the mock fallback, not from SerpApi. Never prints keys.
import { categoriesFor, findPlaces, type Place } from "../lib/serpapi";
import { generatePlans } from "../lib/gemini";
import { planLevel } from "../lib/price";
import type { Tier } from "../lib/tiers";

async function main() {
  const tier = process.argv[2] as Tier;
  if (!["$", "$$", "$$$"].includes(tier)) throw new Error("usage: npm run places:check -- '$' | '$$' | '$$$'");
  const cats = categoriesFor(["food", "entertainment", "outdoors"]);
  const places = await findPlaces(cats, 30.2672, -97.7431, tier);
  console.log(`group tier ${tier}: ${places.length} places within budget (searches: ${cats.join(", ")})`);
  console.table(places.map((p) => ({ name: p.name, category: p.category, type: p.type ?? "(mock)", price: p.price, cost: p.cost, estimated: p.priceEstimated })));

  const plans = await generatePlans({ city: "Austin, TX", slot: "Sat evening", tier, interests: ["food", "entertainment", "outdoors"], places });
  console.log(`\n${plans.length} ${plans.length === 1 ? "plan" : "plans"}:`);
  const byName = new Map<string, Place>(places.map((p) => [p.name.toLowerCase(), p]));
  for (const d of plans) {
    const stops = d.stops.map((s) => byName.get(s.place.toLowerCase())!);
    console.log(`- ${d.title} | level ${planLevel(stops)} | $${d.est_cost_per_person} each | ${d.stops.map((s, i) => `${s.place} [${stops[i].type ?? "mock"}, ${stops[i].price}, $${stops[i].cost}]`).join(" -> ")}`);
    console.log(`    why: ${d.why_fits}`);
  }
  const over = places.filter((p) => p.price.length > tier.length).length;
  console.log(`\nplaces above ${tier}: ${over}; plan stops above ${tier}: ${plans.flatMap((d) => d.stops).filter((s) => byName.get(s.place.toLowerCase())!.price.length > tier.length).length}`);
}
main().catch((e) => { console.error("check failed:", e.message ?? e); process.exit(1); });
