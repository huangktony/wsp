import test from "node:test";
import assert from "node:assert/strict";
import { ComfortPick, MeBody, comfortCaption, effectiveTier, groupTierFrom } from "../lib/comfort";
import { lowestTier } from "../lib/tiers";

test("effective tier: the member's pick wins over the suggestion", () => {
  assert.equal(effectiveTier("$", "$$$"), "$");
  assert.equal(effectiveTier("$$$", "$"), "$$$"); // picking above the suggestion is allowed
});

test("effective tier: no pick falls back to the suggestion, and neither gives null", () => {
  assert.equal(effectiveTier(null, "$$"), "$$");
  assert.equal(effectiveTier(undefined, "$"), "$");
  assert.equal(effectiveTier(null, null), null);
  assert.equal(effectiveTier(undefined, undefined), null);
});

test("effective tier ignores anything that is not a tier", () => {
  assert.equal(effectiveTier("$$$$", "$$"), "$$");
  assert.equal(effectiveTier("", "$"), "$");
  assert.equal(effectiveTier("cheap", "nope"), null);
});

test("group tier is the lowest effective level, using picks", () => {
  // One member is $$$ from spending but picked $, the other is $$: the group is $.
  assert.equal(groupTierFrom([{ comfort_tier: "$", budget_tier: "$$$" }, { comfort_tier: null, budget_tier: "$$" }]), "$");
});

test("group tier without picks is the lowest suggestion, as before", () => {
  assert.equal(groupTierFrom([{ comfort_tier: null, budget_tier: "$$$" }, { comfort_tier: null, budget_tier: "$$" }]), "$$");
  assert.equal(groupTierFrom([{ comfort_tier: null, budget_tier: "$" }, { comfort_tier: null, budget_tier: "$$$" }]), "$");
});

test("a pick above the suggestion can raise that member's own level but never lowers anyone else's", () => {
  assert.equal(groupTierFrom([{ comfort_tier: "$$$", budget_tier: "$" }, { comfort_tier: null, budget_tier: "$$$" }]), "$$$");
  assert.equal(groupTierFrom([{ comfort_tier: "$$$", budget_tier: "$" }, { comfort_tier: null, budget_tier: "$$" }]), "$$");
});

test("members with no level are ignored, and with none at all the group is $$ (the existing default)", () => {
  assert.equal(groupTierFrom([{ comfort_tier: null, budget_tier: null }, { comfort_tier: null, budget_tier: "$$$" }]), "$$$");
  assert.equal(groupTierFrom([{ comfort_tier: null, budget_tier: null }]), "$$");
  assert.equal(groupTierFrom([]), "$$");
  assert.equal(lowestTier([null, undefined]), "$$");
});

test("clearing a pick (null) returns the member to their suggestion", () => {
  const before = groupTierFrom([{ comfort_tier: "$", budget_tier: "$$$" }, { comfort_tier: null, budget_tier: "$$" }]);
  const after = groupTierFrom([{ comfort_tier: null, budget_tier: "$$$" }, { comfort_tier: null, budget_tier: "$$" }]);
  assert.equal(before, "$");
  assert.equal(after, "$$");
});

const body = { availability: ["Sat evening"], interests: ["food"], max_distance_mi: 10 };

test("PUT body: accepts a valid pick, null, or no pick at all", () => {
  assert.equal(MeBody.safeParse({ ...body, comfort_tier: "$" }).success, true);
  assert.equal(MeBody.safeParse({ ...body, comfort_tier: "$$$" }).success, true);
  assert.equal(MeBody.safeParse({ ...body, comfort_tier: null }).success, true);
  const absent = MeBody.parse(body);
  assert.equal(absent.comfort_tier, undefined, "absent must stay undefined so the pick is left alone");
});

test("PUT body: rejects '$$$$' and other junk levels", () => {
  for (const bad of ["$$$$", "", "$$$$$", "cheap", 2, true, ["$"]]) {
    assert.equal(MeBody.safeParse({ ...body, comfort_tier: bad }).success, false, `accepted ${JSON.stringify(bad)}`);
  }
  assert.equal(ComfortPick.safeParse("$$$$").success, false);
});

test("PUT body: the existing rules still hold", () => {
  assert.equal(MeBody.safeParse({ ...body, availability: ["Mon 3am"] }).success, false);
  assert.equal(MeBody.safeParse({ ...body, max_distance_mi: 0 }).success, false);
});

test("caption: using the suggestion explains it, with the average in bold", () => {
  const c = comfortCaption({ suggested: "$$", picked: null, avg: 18 });
  assert.equal(c.kind, "same");
  assert.equal(c.text, "You usually spend about $18 per outing, so WSP looks for places at $$ or below.");
  assert.equal(c.bold, "$18 per outing");
  assert.equal(c.showReset, false);
  assert.ok(c.text.includes(c.bold!));
});

test("caption: picking the same level as the suggestion reads like using it", () => {
  assert.equal(comfortCaption({ suggested: "$$", picked: "$$", avg: 18 }).kind, "same");
});

test("caption: a lower pick says so and offers 'Use suggested'", () => {
  const c = comfortCaption({ suggested: "$$", picked: "$", avg: 18 });
  assert.equal(c.kind, "lower");
  assert.equal(c.text, "Suggested $$ from your spending. You picked $ for this group.");
  assert.equal(c.showReset, true);
});

test("caption: a higher pick adds the 'above what you usually spend' note", () => {
  const c = comfortCaption({ suggested: "$", picked: "$$$", avg: 8.13 });
  assert.equal(c.kind, "higher");
  assert.equal(c.text, "Suggested $ from your spending. You picked $$$ for this group. That's above what you usually spend.");
  assert.equal(c.showReset, true);
});

test("caption: with no suggestion it asks to link or pick, with or without a pick, and never offers a reset", () => {
  for (const picked of [null, "$", "$$$"] as const) {
    const c = comfortCaption({ suggested: null, picked, avg: null });
    assert.equal(c.kind, "none");
    assert.equal(c.text, "Link a demo account for a suggestion, or pick a level.");
    assert.equal(c.showReset, false);
  }
});

test("caption: the average is rounded to whole dollars, and a missing average does not print 'null'", () => {
  const cap = (avg: number) => comfortCaption({ suggested: "$", picked: null, avg }).text;
  assert.ok(cap(21.81).includes("about $22 per outing"));
  assert.ok(cap(8.13).includes("about $8 per outing"));
  assert.ok(cap(18).includes("about $18 per outing"));
  assert.ok(cap(18.5).includes("about $19 per outing"));
  assert.ok(cap(18.49).includes("about $18 per outing"));
  assert.ok(!/\d\.\d/.test(cap(21.81)), "no cents in the sentence");
  const c = comfortCaption({ suggested: "$$", picked: null, avg: null });
  assert.ok(!c.text.includes("null") && !c.text.includes("undefined"));
  assert.equal(c.bold, undefined);
});
