import test from "node:test";
import assert from "node:assert/strict";
import {
  BALANCE_RANGE, CANCELLED_AMOUNT, CANCELLED_COUNT, FUN_BANDS, FUN_COUNT, OTHER_BANDS, OTHER_COUNT, OTHER_MERCHANTS,
  PROFILES, planPurchases, startingBalance, type Spender,
} from "../lib/profiles";
import { analyze, type MerchantInfo, type NessiePurchase } from "../lib/analyze";
import { SEED_MERCHANTS } from "../lib/nessie";
import { tierFromAvg } from "../lib/tiers";

const INTENDED: Record<Spender, string> = { frugal: "$", average: "$$", big: "$$$" };
const NOW = new Date("2026-10-24T15:00:00Z");
const USERS = Array.from({ length: 500 }, (_, i) => i + 1);

// merchant name -> category, exactly as the seeded merchants are created in Nessie
const CATEGORY = new Map(SEED_MERCHANTS.map((m) => [m.name, m.category]));
const isFun = (name: string) => CATEGORY.get(name) === "food" || CATEGORY.get(name) === "entertainment";

test("every fun band lies entirely inside the profile's intended tier, in whole dollars", () => {
  for (const p of PROFILES) {
    for (const [merchant, [lo, hi]] of Object.entries(FUN_BANDS[p])) {
      assert.ok(Number.isInteger(lo) && Number.isInteger(hi) && lo <= hi, `${p} ${merchant}`);
      assert.equal(tierFromAvg(lo), INTENDED[p], `${p} ${merchant} low end`);
      assert.equal(tierFromAvg(hi), INTENDED[p], `${p} ${merchant} high end`);
    }
  }
});

test("names and categories used by the generator match the seeded Nessie merchants", () => {
  for (const p of PROFILES) for (const name of Object.keys(FUN_BANDS[p])) assert.ok(isFun(name), `${name} is not a seeded food/entertainment merchant`);
  for (const m of OTHER_MERCHANTS) assert.equal(CATEGORY.get(m.name), m.category, m.name);
});

test("1..500 users x every profile: every fun amount is inside its merchant's band", () => {
  for (const p of PROFILES) {
    for (const id of USERS) {
      for (const x of planPurchases(id, p)) {
        if (x.status !== "completed" || !isFun(x.merchant)) continue;
        const band = FUN_BANDS[p][x.merchant];
        assert.ok(band, `${p} user ${id} visited ${x.merchant}`);
        assert.ok(Number.isInteger(x.amount) && x.amount >= band[0] && x.amount <= band[1], `${p} user ${id} ${x.merchant} $${x.amount}`);
      }
    }
  }
});

test("1..500 users x every profile: avgFun through analyze() is always the intended tier", () => {
  const merchants = new Map<string, MerchantInfo>(SEED_MERCHANTS.map((m) => [m.name, { name: m.name, category: m.category }]));
  for (const p of PROFILES) {
    for (const id of USERS) {
      const rows: NessiePurchase[] = planPurchases(id, p).map((x) => ({
        merchant_id: x.merchant, amount: x.amount, status: x.status,
        purchase_date: new Date(NOW.getTime() - x.daysAgo * 864e5).toISOString().slice(0, 10),
      }));
      const a = analyze(rows, merchants, 30, NOW);
      assert.equal(a.tier, INTENDED[p], `${p} user ${id} avgFun ${a.avgFun}`);
      assert.equal(a.usedDefault, false);
      assert.equal(a.count, FUN_COUNT + OTHER_COUNT); // the cancelled ones are dropped
    }
  }
});

test("a frugal user never visits Alamo, Franklin or Emo's", () => {
  for (const id of USERS) {
    const names = new Set(planPurchases(id, "frugal").map((x) => x.merchant));
    for (const banned of ["Alamo Drafthouse", "Franklin Barbecue", "Emo's Austin"]) assert.ok(!names.has(banned), `user ${id} visited ${banned}`);
  }
});

test("average users visit all six fun merchants across many users; big spenders lean toward the pricey three", () => {
  const seen = new Set<string>();
  for (const id of USERS) for (const x of planPurchases(id, "average")) if (x.status === "completed" && isFun(x.merchant)) seen.add(x.merchant);
  assert.equal(seen.size, 6);

  const PRICEY = new Set(["Alamo Drafthouse", "Franklin Barbecue", "Emo's Austin"]);
  let pricey = 0, total = 0;
  for (const id of USERS) for (const x of planPurchases(id, "big")) if (x.status === "completed" && isFun(x.merchant)) { total++; if (PRICEY.has(x.merchant)) pricey++; }
  assert.ok(pricey / total > 0.6, `big spenders' pricey share was ${(pricey / total).toFixed(2)}`);
});

test("everyday spending scales with the profile (a frugal user never has a $61 Target)", () => {
  for (const p of PROFILES) {
    for (const id of USERS) {
      for (const x of planPurchases(id, p)) {
        const other = OTHER_MERCHANTS.find((m) => m.name === x.merchant);
        if (!other || x.status !== "completed") continue;
        const [lo, hi] = OTHER_BANDS[p][other.category];
        assert.ok(x.amount >= lo && x.amount <= hi, `${p} user ${id} ${x.merchant} $${x.amount}`);
      }
    }
  }
  assert.ok(OTHER_BANDS.frugal.shopping[1] < 61 && OTHER_BANDS.frugal.groceries[1] < 61);
});

test("each user gets the planned mix: 16 fun, 7 everyday, 2 cancelled, all within the last 29 days", () => {
  for (const p of PROFILES) {
    const rows = planPurchases(7, p);
    assert.equal(rows.length, FUN_COUNT + OTHER_COUNT + CANCELLED_COUNT);
    assert.equal(rows.filter((x) => x.status === "cancelled").length, CANCELLED_COUNT);
    assert.ok(rows.filter((x) => x.status === "cancelled").every((x) => x.amount === CANCELLED_AMOUNT));
    assert.ok(rows.every((x) => Number.isInteger(x.amount) && x.daysAgo >= 0 && x.daysAgo <= 28));
  }
});

test("the plan is deterministic per user and differs between users", () => {
  assert.deepEqual(planPurchases(42, "average"), planPurchases(42, "average"));
  assert.notDeepEqual(planPurchases(42, "average"), planPurchases(43, "average"));
});

test("starting balance is a whole number inside the profile's range for many users", () => {
  for (const p of PROFILES) {
    const [lo, hi] = BALANCE_RANGE[p];
    for (let id = 0; id < 2000; id++) {
      const b = startingBalance(p, id);
      assert.ok(Number.isInteger(b) && b >= lo && b <= hi, `${p} user ${id} got ${b}`);
    }
  }
});

test("starting balance is deterministic and actually varies across users", () => {
  assert.equal(startingBalance("average", 42), startingBalance("average", 42));
  const seen = new Set(Array.from({ length: 50 }, (_, id) => startingBalance("big", id)));
  assert.ok(seen.size > 30, `only ${seen.size} distinct values`);
});

test("the three balance ranges are ordered and do not overlap", () => {
  assert.ok(BALANCE_RANGE.frugal[1] < BALANCE_RANGE.average[0]);
  assert.ok(BALANCE_RANGE.average[1] < BALANCE_RANGE.big[0]);
});
