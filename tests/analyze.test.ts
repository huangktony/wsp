import test from "node:test";
import assert from "node:assert/strict";
import { analyze, DEFAULT_FUN_AVG, UNKNOWN_MERCHANT, type MerchantInfo, type NessiePurchase } from "../lib/analyze";

const NOW = new Date("2026-10-24T15:00:00Z");
const M = new Map<string, MerchantInfo>([
  ["f", { name: "Torchy's", category: "food" }],
  ["e", { name: "Alamo", category: "entertainment" }],
  ["g", { name: "H-E-B", category: "groceries" }],
  ["t", { name: "Uber", category: "transport" }],
]);
const p = (merchant_id: string, amount: number, purchase_date = "2026-10-20", status = "completed"): NessiePurchase => ({ merchant_id, amount, purchase_date, status });
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 864e5).toISOString().slice(0, 10);

test("(a) hand-computed case: cancelled ignored, groceries in totals, fun average 18.00", () => {
  const r = analyze([p("f", 10), p("f", 14), p("e", 30), p("g", 48), p("f", 100, "2026-10-21", "cancelled")], M, 30, NOW);
  assert.equal(r.avgFun, 18);
  assert.equal(r.tier, "$$");
  assert.equal(r.usedDefault, false);
  assert.equal(r.count, 4);
  assert.equal(r.spent, 102);
  assert.deepEqual(r.categories, [
    { name: "groceries", total: 48 },
    { name: "entertainment", total: 30 },
    { name: "food", total: 24 },
  ]);
});

test("(b) window is exactly N calendar days: 29 days old counts, 30 and 31 do not", () => {
  const r = analyze([p("f", 5, daysAgo(29)), p("f", 7, daysAgo(30)), p("f", 9, daysAgo(31))], M, 30, NOW);
  assert.equal(r.count, 1);
  assert.equal(r.spent, 5);
  const week = analyze([p("f", 5, daysAgo(6)), p("f", 7, daysAgo(7))], M, 7, NOW);
  assert.equal(week.count, 1);
  assert.equal(week.spent, 5);
});

test("(c) tier cutoffs: 12 is $, 12.01 is $$, 30 is $$, 30.01 is $$$", () => {
  const tier = (amount: number) => analyze([p("f", amount)], M, 30, NOW).tier;
  assert.equal(tier(12), "$");
  assert.equal(tier(12.01), "$$");
  assert.equal(tier(30), "$$");
  assert.equal(tier(30.01), "$$$");
});

test("(c2) whole-dollar purchases can average to a fraction across a cutoff", () => {
  const r = analyze([p("f", 12), p("e", 13)], M, 30, NOW);
  assert.equal(r.avgFun, 12.5);
  assert.equal(r.tier, "$$");
  assert.equal(analyze([p("f", 11), p("e", 12)], M, 30, NOW).tier, "$");
  assert.equal(analyze([p("f", 30), p("e", 31)], M, 30, NOW).avgFun, 30.5);
  assert.equal(analyze([p("f", 30), p("e", 31)], M, 30, NOW).tier, "$$$");
});

test("(c3) average is rounded to cents", () => {
  assert.equal(analyze([p("f", 10), p("f", 10), p("f", 11)], M, 30, NOW).avgFun, 10.33);
});

test("(d) unknown category is 'other' and not fun; category is case and whitespace insensitive", () => {
  const m = new Map(M).set("n", { name: "Club", category: "Nightlife" }).set("c", { name: "Cafe", category: "  Food " });
  const r = analyze([p("n", 40), p("c", 8)], m, 30, NOW);
  assert.deepEqual(r.categories.map((c) => c.name).sort(), ["food", "other"]);
  assert.equal(r.avgFun, 8); // only the food purchase is fun
});

test("(d2) a missing merchant is 'other' named 'Unknown merchant', never the raw id", () => {
  const r = analyze([p("zzz-raw-id", 15)], M, 30, NOW);
  assert.equal(r.recent[0].merchant, UNKNOWN_MERCHANT);
  assert.equal(r.recent[0].category, "other");
  assert.ok(!JSON.stringify(r).includes("zzz-raw-id"));
  assert.equal(r.usedDefault, true);
});

test("(d3) a merchant with no category is 'other'", () => {
  const r = analyze([p("x", 15)], new Map([["x", { name: "Mystery" } as MerchantInfo]]), 30, NOW);
  assert.equal(r.recent[0].category, "other");
});

test("(e) zero purchases does not crash and flags the default", () => {
  const r = analyze([], M, 30, NOW);
  assert.equal(r.count, 0);
  assert.deepEqual(r.categories, []);
  assert.deepEqual(r.recent, []);
  assert.equal(r.spent, 0);
  assert.equal(r.usedDefault, true);
  assert.equal(r.avgFun, DEFAULT_FUN_AVG);
});

test("(f) category comes from the merchant, not the purchase description", () => {
  const withDescription = { ...p("g", 40), description: "entertainment" } as NessiePurchase;
  const r = analyze([withDescription], M, 30, NOW);
  assert.equal(r.categories[0].name, "groceries");
  assert.equal(r.usedDefault, true); // not counted as fun
});

test("(g) recent is newest first, capped at 5, with merchant names", () => {
  const rows = ["2026-10-01", "2026-10-05", "2026-10-03", "2026-10-09", "2026-10-07", "2026-10-02", "2026-10-08"].map((d, i) => p("f", i + 1, d));
  const r = analyze(rows, M, 30, NOW);
  assert.deepEqual(r.recent.map((x) => x.date), ["2026-10-09", "2026-10-08", "2026-10-07", "2026-10-05", "2026-10-03"]);
  assert.ok(r.recent.every((x) => x.merchant === "Torchy's"));
});

test("(h) a purchase dated after today is excluded, one dated today is included", () => {
  const r = analyze([p("f", 10, daysAgo(0)), p("f", 99, daysAgo(-1)), p("e", 99, daysAgo(-30))], M, 30, NOW);
  assert.equal(r.count, 1);
  assert.equal(r.spent, 10);
});
