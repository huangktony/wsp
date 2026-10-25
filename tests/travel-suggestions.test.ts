import test from "node:test";
import assert from "node:assert/strict";
import { budgetSuggestions } from "../lib/travel/finance";

test("presets are 10%, 20% and 35% of available, floored to the nearest $10", () => {
  assert.deepEqual(budgetSuggestions(1000), { light: 100, room: 200, flex: 350, available: 1000 });
  assert.deepEqual(budgetSuggestions(1234.56), { light: 120, room: 240, flex: 430, available: 1234.56 });
  assert.deepEqual(budgetSuggestions(350), { light: 30, room: 70, flex: 120, available: 350 });
});

test("each preset is at least $10, even for a tiny balance", () => {
  assert.deepEqual(budgetSuggestions(0), { light: 10, room: 10, flex: 10, available: 0 });
  assert.deepEqual(budgetSuggestions(50), { light: 10, room: 10, flex: 10, available: 50 });
  assert.deepEqual(budgetSuggestions(99.99), { light: 10, room: 10, flex: 30, available: 99.99 });
});

test("presets stay ordered light <= room <= flex", () => {
  for (const available of [0, 9, 10, 55, 100, 777, 4321, 100000]) {
    const s = budgetSuggestions(available)!;
    assert.ok(s.light <= s.room && s.room <= s.flex, String(available));
    for (const v of [s.light, s.room, s.flex]) assert.equal(v % 10, 0);
  }
});

test("unknown or invalid available gives null so the page falls back to the fixed presets", () => {
  for (const bad of [null, NaN, Infinity, -1]) assert.equal(budgetSuggestions(bad as number | null), null, String(bad));
});

import { presetsFor } from "../lib/travel/core";
test("the page shows dollar amounts with the three labels, and falls back to 200/400/700", () => {
  assert.deepEqual(presetsFor({ light: 30, room: 70, flex: 120, available: 350 }), [
    { amount: 30, label: "Keep it light" }, { amount: 70, label: "A little room" }, { amount: 120, label: "More flexibility" }]);
  for (const none of [null, undefined]) assert.deepEqual(presetsFor(none).map((p) => p.amount), [200, 400, 700]);
});
