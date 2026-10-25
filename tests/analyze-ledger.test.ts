import test from "node:test";
import assert from "node:assert/strict";
import { analyze, PAID_BACK_CATEGORY, type MerchantInfo, type NessiePurchase } from "../lib/analyze";
import { splitDescription, type LedgerEntry } from "../lib/ledger";

const NOW = new Date("2026-10-24T15:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 864e5).toISOString().slice(0, 10);
const M = new Map<string, MerchantInfo>([
  ["f", { name: "Torchy's", category: "food" }],
  ["e", { name: "Alamo", category: "entertainment" }],
  ["h", { name: "WSP Hangout", category: "hangout" }],
]);
const buy = (merchant_id: string, amount: number, purchase_date = daysAgo(2)): NessiePurchase => ({ merchant_id, amount, purchase_date, status: "completed" });
const desc = (payId: number, counterpart: string, cents: number) => splitDescription({ payId, counterpart, cents, label: "Crew hangout" });
const inRow = (cents: number, from: string, date = daysAgo(1), amount = Math.round(cents / 100)): LedgerEntry => ({ kind: "in", date, amount, description: desc(1, from, cents) });
const outRow = (cents: number, to: string, date = daysAgo(1), amount = Math.round(cents / 100)): LedgerEntry => ({ kind: "out", date, amount, description: desc(2, to, cents) });
const NAMES = new Map([["acct-bea", "Bea"], ["acct-alex", "Alex"]]);

test("a payback to you shows +amount (exact cents) with the friend's name", () => {
  const a = analyze([], M, 30, NOW, [inRow(1833, "acct-bea")], NAMES);
  assert.deepEqual(a.transactions, [{ date: daysAgo(1), label: "Bea paid you back", amount: 18.33, kind: "paid_you_back", category: "paid back" }]);
  assert.equal(a.paidBackToYou, 18.33);
  assert.equal(a.spent, 0, "money coming in is not spending");
});

test("a payback you made shows -amount with the friend's name and counts as spent", () => {
  const a = analyze([], M, 30, NOW, [outRow(1833, "acct-alex")], NAMES);
  assert.deepEqual(a.transactions, [{ date: daysAgo(1), label: "Paid back Alex", amount: -18.33, kind: "paid_back", category: "paid back" }]);
  assert.equal(a.spent, 18.33);
  assert.equal(a.paidBackToYou, 0);
  assert.deepEqual(a.categories, [{ name: PAID_BACK_CATEGORY, total: 18.33 }]);
});

test("the hangout purchase counts as spent but never as fun, so the tier does not change", () => {
  const before = analyze([buy("f", 8), buy("e", 9)], M, 30, NOW);
  const after = analyze([buy("f", 8), buy("e", 9), buy("h", 120)], M, 30, NOW);
  assert.equal(before.tier, "$");
  assert.equal(after.tier, before.tier);
  assert.equal(after.avgFun, before.avgFun);
  assert.equal(after.spent, before.spent + 120);
  assert.ok(after.categories.some((c) => c.name === "hangout" && c.total === 120));
});

test("paybacks never change the tier either", () => {
  const base = analyze([buy("f", 8), buy("e", 9)], M, 30, NOW);
  const withLedger = analyze([buy("f", 8), buy("e", 9)], M, 30, NOW, [inRow(50000, "acct-bea"), outRow(90000, "acct-alex")], NAMES);
  assert.equal(withLedger.tier, base.tier);
  assert.equal(withLedger.avgFun, base.avgFun);
});

test("a counterpart who is not in the names map is shown as 'a friend'", () => {
  const a = analyze([], M, 30, NOW, [inRow(500, "acct-stranger"), outRow(700, "acct-other")], NAMES);
  const labels = a.transactions.map((t) => t.label).sort();
  assert.deepEqual(labels, ["Paid back a friend", "a friend paid you back"]);
});

test("the window applies to ledger rows: old and future rows are ignored", () => {
  const a = analyze([], M, 7, NOW, [inRow(500, "acct-bea", daysAgo(6)), inRow(900, "acct-bea", daysAgo(7)), inRow(300, "acct-bea", daysAgo(-1)), outRow(400, "acct-alex", daysAgo(20))], NAMES);
  assert.equal(a.transactions.length, 1);
  assert.equal(a.paidBackToYou, 5);
  assert.equal(a.spent, 0);
  assert.equal(analyze([], M, 30, NOW, [outRow(400, "acct-alex", daysAgo(20))], NAMES).spent, 4);
});

test("rows WSP did not write are never shown, and no raw description or account id leaks", () => {
  const rows: LedgerEntry[] = [
    { kind: "in", date: daysAgo(1), amount: 500, description: "Paycheck from employer" },
    { kind: "out", date: daysAgo(1), amount: 80, description: "Rent acct-secret-999" },
    inRow(1000, "acct-bea"),
  ];
  const a = analyze([], M, 30, NOW, rows, NAMES);
  assert.equal(a.transactions.length, 1);
  const json = JSON.stringify(a);
  for (const leak of ["Paycheck", "Rent", "acct-secret-999", "acct-bea", "WSP split", "pay="]) assert.ok(!json.includes(leak), `leaked ${leak}`);
});

test("a row with garbage cents falls back to Nessie's amount", () => {
  const bad: LedgerEntry = { kind: "in", date: daysAgo(1), amount: 18, description: "WSP split|pay=3|acct=acct-bea|cents=oops|l" };
  assert.equal(analyze([], M, 30, NOW, [bad], NAMES).transactions[0].amount, 18);
});

test("transactions mix purchases and paybacks newest first, purchases negative", () => {
  const a = analyze([buy("f", 12, daysAgo(5)), buy("h", 90, daysAgo(2))], M, 30, NOW, [inRow(3000, "acct-bea", daysAgo(1)), outRow(2000, "acct-alex", daysAgo(3))], NAMES);
  assert.deepEqual(a.transactions.map((t) => [t.date, t.label, t.amount]), [
    [daysAgo(1), "Bea paid you back", 30],
    [daysAgo(2), "WSP Hangout", -90],
    [daysAgo(3), "Paid back Alex", -20],
    [daysAgo(5), "Torchy's", -12],
  ]);
  assert.equal(a.spent, 90 + 12 + 20);
  assert.equal(a.paidBackToYou, 30);
  assert.equal(a.count, 2, "count is still purchases only");
});

test("no ledger means the old behavior and an empty paid-back total", () => {
  const a = analyze([buy("f", 10)], M, 30, NOW);
  assert.equal(a.paidBackToYou, 0);
  assert.equal(a.transactions.length, 1);
  assert.equal(a.spent, 10);
});

test("each transaction carries its category so the screen can color it: purchases by merchant, paybacks as 'paid back'", () => {
  const a = analyze([buy("f", 12, daysAgo(3)), buy("h", 40, daysAgo(2))], M, 30, NOW, [inRow(500, "acct-bea", daysAgo(1))], NAMES);
  assert.deepEqual(a.transactions.map((t) => t.category), ["paid back", "hangout", "food"]);
});
