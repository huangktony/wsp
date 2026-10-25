import test from "node:test";
import assert from "node:assert/strict";
import { BALANCE_RANGE, FUN_RANGE, PROFILES, startingBalance, type Spender } from "../lib/profiles";
import { analyze, type MerchantInfo, type NessiePurchase } from "../lib/analyze";
import { tierFromAvg } from "../lib/tiers";

const INTENDED: Record<Spender, string> = { frugal: "$", average: "$$", big: "$$$" };
const NOW = new Date("2026-10-24T15:00:00Z");
const M = new Map<string, MerchantInfo>([["f", { name: "Torchy's", category: "food" }]]);
const day = "2026-10-20";
const buy = (amount: number): NessiePurchase => ({ merchant_id: "f", purchase_date: day, amount, status: "completed" });

test("every profile's fun range lands entirely in its intended tier (both ends, through analyze)", () => {
  for (const p of PROFILES) {
    const [lo, hi] = FUN_RANGE[p];
    assert.equal(tierFromAvg(lo), INTENDED[p], `${p} low end`);
    assert.equal(tierFromAvg(hi), INTENDED[p], `${p} high end`);
    assert.equal(analyze([buy(lo), buy(hi)], M, 30, NOW).tier, INTENDED[p], `${p} mixed through analyze`);
    assert.ok(Number.isInteger(lo) && Number.isInteger(hi), `${p} amounts are whole dollars`);
  }
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
