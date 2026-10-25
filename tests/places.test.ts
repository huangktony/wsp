import test from "node:test";
import assert from "node:assert/strict";
import { estimatePlace, parseRealPrice, planLevel } from "../lib/price";
import { findPlaces, placeFromResult, queryFor, type Place, type SearchFn } from "../lib/serpapi";
import { mockPlans, withinBudget } from "../lib/gemini";
import type { Tier } from "../lib/tiers";

// Fixtures modeled on a real google_maps result: title, type, types, rating, address, and NO price field.
const R = {
  taco: { title: "Torchy's Tacos", type: "Taco restaurant", types: ["Taco restaurant", "Mexican restaurant"], rating: 4.5, address: "2801 Guadalupe St" },
  bbq: { title: "Franklin Barbecue", type: "Barbecue restaurant", types: ["Barbecue restaurant", "Restaurant"], rating: 4.8, address: "900 E 11th St" },
  steak: { title: "Perry's Steakhouse", type: "Steak house", types: ["Steak house", "Restaurant"], rating: 4.6, address: "114 W 7th St" },
  park: { title: "Zilker Park", type: "Park", types: ["Park"], rating: 4.8, address: "2100 Barton Springs Rd" },
  beerGarden: { title: "Container Bar", type: "Beer garden", types: ["Beer garden", "Bar"], rating: 4.4, address: "90 Rainey St" },
  amusement: { title: "Fun Park", type: "Amusement park", types: ["Amusement park"], rating: 4.2, address: "1 Fun Way" },
  club: { title: "Emo's Austin", type: "Night club", types: ["Night club", "Live music venue"], rating: 4.4, address: "2015 E Riverside Dr" },
  plain: { title: "Corner Restaurant", type: "Restaurant", types: ["Restaurant"], rating: 4.3, address: "1 Main St" },
};

test("types override the query tier: a taco place is $ even from a $$ query", () => {
  const p = placeFromResult(R.taco, "food", "$$");
  assert.equal(p.price, "$");
  assert.equal(p.cost, 12);
  assert.equal(p.priceEstimated, true);
});

test("a park is $ and free (cost 0)", () => {
  const p = placeFromResult(R.park, "outdoors", "$$$");
  assert.equal(p.price, "$");
  assert.equal(p.cost, 0);
});

test("a steak house from a $ query is $$, so it cannot be in a $ group", () => {
  const p = placeFromResult(R.steak, "food", "$");
  assert.equal(p.price, "$$");
  assert.equal(p.cost, 25);
  assert.equal(placeFromResult(R.steak, "food", "$$$").price, "$$$"); // never lowered below the query tier
});

test("a beer garden and an amusement park are not free", () => {
  assert.notEqual(placeFromResult(R.beerGarden, "entertainment", "$$").cost, 0);
  assert.notEqual(placeFromResult(R.amusement, "entertainment", "$$").cost, 0);
});

test("a place with no helpful type takes the tier of the query that found it", () => {
  assert.equal(placeFromResult(R.plain, "food", "$").price, "$");
  assert.equal(placeFromResult(R.plain, "food", "$$").price, "$$");
  assert.equal(placeFromResult(R.plain, "food", "$$$").price, "$$$");
});

test("real price fields win if SerpApi ever sends one", () => {
  assert.equal(parseRealPrice("$"), "$");
  assert.equal(parseRealPrice("$$"), "$$");
  assert.equal(parseRealPrice("$$$$"), "$$$");
  assert.equal(parseRealPrice("$10–20"), "$"); // midpoint 15
  assert.equal(parseRealPrice("$20-30"), "$$"); // midpoint 25
  assert.equal(parseRealPrice("$60"), "$$$");
  assert.equal(parseRealPrice("n/a"), null);
  assert.equal(parseRealPrice(undefined), null);
  const g = estimatePlace({ queryTier: "$", types: ["Steak house"], realPrice: "$$" });
  assert.deepEqual(g, { price: "$$", cost: 25, estimated: false });
});

test("search terms depend on the group tier", () => {
  assert.equal(queryFor("food", "$"), "cheap eats");
  assert.equal(queryFor("food", "$$"), "restaurants");
  assert.equal(queryFor("food", "$$$"), "upscale restaurants");
  assert.equal(queryFor("entertainment", "$"), "free things to do");
  assert.equal(queryFor("entertainment", "$$"), "things to do");
  assert.equal(queryFor("entertainment", "$$$"), "nightlife");
  assert.equal(queryFor("coffee", "$"), "coffee shops");
  assert.equal(queryFor("outdoors", "$$$"), "parks");
});

const fakeSearch = (results: Record<string, any[]>): SearchFn => async (cat, tier) => (results[cat] ?? []).map((r) => placeFromResult(r, cat, tier));

test("findPlaces: a $ group never gets a $$ or $$$ place", async () => {
  const places = await findPlaces(["food", "entertainment", "outdoors"], 0, 0, "$", fakeSearch({ food: [R.taco, R.steak, R.bbq], entertainment: [R.club, R.beerGarden], outdoors: [R.park] }));
  assert.ok(places.length > 0);
  assert.ok(places.every((p) => p.price === "$"), JSON.stringify(places.map((p) => [p.name, p.price])));
  assert.ok(!places.some((p) => p.name === "Perry's Steakhouse"));
});

test("findPlaces: when nothing fits it returns [] (no over-budget fallback)", async () => {
  const places = await findPlaces(["food"], 0, 0, "$", fakeSearch({ food: [R.steak] }));
  assert.deepEqual(places, []);
});

const P = (name: string, price: Tier, category: string, cost?: number): Place => ({ name, category, price, cost: cost ?? ({ $: 12, $$: 25, $$$: 50 }[price]), priceEstimated: true, rating: 4.5, address: "" });
const MIX = [P("Taco Spot", "$", "food"), P("Mini Golf", "$", "entertainment"), P("Creek Park", "$", "outdoors", 0), P("Fancy Grill", "$$", "food"), P("Opera", "$$$", "entertainment")];

test("mockPlans: a $ group never gets a $$ or $$$ place", () => {
  const plans = mockPlans(MIX, "Sat evening", "$");
  assert.ok(plans.length > 0);
  const byName = new Map(MIX.map((p) => [p.name, p]));
  for (const plan of plans) for (const s of plan.stops) assert.equal(byName.get(s.place)!.price, "$", `${plan.title} uses ${s.place}`);
  assert.ok(!JSON.stringify(plans).includes("Fancy Grill") && !JSON.stringify(plans).includes("Opera"));
});

test("two $ stops make a $ plan with cost 24, not a $$ plan", () => {
  const plans = mockPlans([P("Taco Spot", "$", "food"), P("Mini Golf", "$", "entertainment")], "Sat evening", "$");
  const two = plans.find((p) => p.stops.length === 2)!;
  assert.ok(two, "expected a two-stop plan");
  assert.equal(two.est_cost_per_person, 24);
  assert.equal(planLevel(two.stops.map((s) => ({ price: "$" }))), "$");
});

test("a free stop costs 0 and counts toward the sum", () => {
  const plans = mockPlans([P("Creek Park", "$", "outdoors", 0), P("Taco Spot", "$", "food")], "Sat evening", "$");
  const two = plans.find((p) => p.stops.length === 2)!;
  assert.equal(two.est_cost_per_person, 12);
});

test("planLevel is the most expensive stop, and unknown stops use the fallback", () => {
  assert.equal(planLevel([{ price: "$" }, { price: "$$" }]), "$$");
  assert.equal(planLevel([{ price: "$$$" }, { price: "$" }]), "$$$");
  assert.equal(planLevel([]), "$");
});

test("nothing fits: mockPlans returns [] and makes no false 'inside the budget' claim", () => {
  const plans = mockPlans([P("Fancy Grill", "$$", "food"), P("Opera", "$$$", "entertainment")], "Sat evening", "$");
  assert.deepEqual(plans, []);
  assert.deepEqual(mockPlans([], "Sat evening", "$"), []);
});

test("why_fits only claims the budget it really meets", () => {
  for (const tier of ["$", "$$", "$$$"] as Tier[]) {
    const byName = new Map(MIX.map((p) => [p.name, p]));
    for (const plan of mockPlans(MIX, "Sat evening", tier)) {
      const claim = plan.why_fits.match(/inside the (\$+) group budget/);
      if (claim) assert.ok(plan.stops.every((s) => byName.get(s.place)!.price.length <= claim[1].length));
    }
  }
});

test("withinBudget rejects unknown places and over-budget stops", () => {
  const draft = (place: string) => [{ title: "t", summary: "s", stops: [{ place, time: "7 PM" }], est_cost_per_person: 10, why_fits: "w" }];
  assert.equal(withinBudget(draft("Taco Spot"), MIX, "$"), true);
  assert.equal(withinBudget(draft("taco spot"), MIX, "$"), true); // case-insensitive
  assert.equal(withinBudget(draft("Fancy Grill"), MIX, "$"), false);
  assert.equal(withinBudget(draft("Made Up Place"), MIX, "$$$"), false);
});

test("a plan with an unpriced stop is never labeled $ (unknown counts as the most expensive)", () => {
  assert.equal(planLevel([{ price: "$" }, {}]), "$$$");
  assert.equal(planLevel([{ price: "$" }, { price: undefined }]), "$$$");
  assert.equal(planLevel([{}]), "$$$");
  assert.notEqual(planLevel([{ price: "$" }, { price: "" }]), "$");
});
