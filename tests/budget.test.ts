import test from "node:test";
import assert from "node:assert/strict";
import { balanceSeries, budgetSummary, sumOwed } from "../lib/budget";
import { analyze, CATEGORIES, PAID_BACK_CATEGORY, type MerchantInfo, type NessiePurchase } from "../lib/analyze";
import { splitDescription, type LedgerEntry } from "../lib/ledger";
import { formatMoney, formatSigned, relativeDay } from "../lib/format";
import { CATEGORY_STYLE, categoryStyle } from "../components/categoryStyle";

const NOW = new Date("2026-10-24T15:00:00Z");
const TODAY = "2026-10-24";
// Window of 30 days: index 0 is 29 days ago, index 29 is today. "day 3" below is index 3.
const dayIdx = (i: number) => new Date(NOW.getTime() - (29 - i) * 864e5).toISOString().slice(0, 10);
const M = new Map<string, MerchantInfo>([["f", { name: "Torchy's", category: "food" }]]);
const buy = (amount: number, date: string, status = "completed"): NessiePurchase => ({ merchant_id: "f", purchase_date: date, amount, status });
const desc = (payId: number, cents: number) => splitDescription({ payId, counterpart: "acct-x", cents, label: "l" });
const received = (cents: number, date: string): LedgerEntry => ({ kind: "in", date, amount: Math.round(cents / 100), description: desc(1, cents) });
const made = (cents: number, date: string): LedgerEntry => ({ kind: "out", date, amount: Math.round(cents / 100), description: desc(2, cents) });

test("balance: start 1000, purchase 50 on day 3, payback received 24 on day 5, payback made 10 on day 6 -> 964 today", () => {
  const a = analyze([buy(50, dayIdx(3))], M, 30, NOW, [received(2400, dayIdx(5)), made(1000, dayIdx(6))]);
  const s = balanceSeries(1000, a.transactions, 30, NOW);
  assert.equal(s.length, 30);
  assert.equal(s[0].date, dayIdx(0));
  assert.equal(s[29].date, TODAY);
  assert.equal(s[2].value, 1000); // before the purchase
  assert.equal(s[3].value, 950); // purchase lands
  assert.equal(s[4].value, 950);
  assert.equal(s[5].value, 974); // payback received
  assert.equal(s[6].value, 964); // payback made
  assert.equal(s[29].value, 964); // today
});

test("balance: cancelled purchases, future rows and rows older than the window are ignored", () => {
  const a = analyze(
    [buy(50, dayIdx(3)), buy(500, dayIdx(4), "cancelled"), buy(77, "2026-10-26"), buy(33, "2026-08-01")], M, 30, NOW,
    [received(9900, "2026-10-27"), made(8800, "2026-07-01")],
  );
  const s = balanceSeries(1000, a.transactions, 30, NOW);
  assert.equal(s[29].value, 950);
});

test("balance: same-day rows add up, and cents from paybacks are kept", () => {
  const a = analyze([buy(10, dayIdx(10)), buy(5, dayIdx(10))], M, 30, NOW, [received(1833, dayIdx(10))]);
  assert.equal(balanceSeries(100, a.transactions, 30, NOW)[10].value, 100 - 15 + 18.33);
});

test("balance: no activity is a flat line at the starting balance", () => {
  const s = balanceSeries(783, [], 30, NOW);
  assert.equal(s.length, 30);
  assert.ok(s.every((p) => p.value === 783));
});

test("you owe: only 'owed' rows are summed, in cents", () => {
  assert.equal(sumOwed([{ amount: 24, status: "owed" }, { amount: 18.33, status: "owed" }, { amount: 50, status: "paid" }]), 42.33);
  assert.equal(sumOwed([{ amount: 24, status: "paid" }]), 0);
  assert.equal(sumOwed([]), 0);
  assert.equal(sumOwed([{ amount: 0.1, status: "owed" }, { amount: 0.2, status: "owed" }]), 0.3);
});

test("net position is balance minus what you owe, and change is the move in balance over the window", () => {
  const a = analyze([buy(190, dayIdx(8))], M, 30, NOW);
  const s = budgetSummary({ startingBalance: 880 + 190, transactions: a.transactions, owe: 410, days: 30, now: NOW });
  assert.equal(s.balance, 880);
  assert.equal(s.owe, 410);
  assert.equal(s.net, 470);
  assert.equal(s.change, -190);
  const up = budgetSummary({ startingBalance: 100, transactions: [{ date: dayIdx(2), amount: 40 }], owe: 0, days: 30, now: NOW });
  assert.equal(up.change, 40);
  assert.equal(up.net, 140);
});

test("net position can go negative", () => {
  const s = budgetSummary({ startingBalance: 100, transactions: [], owe: 250, days: 30, now: NOW });
  assert.equal(s.net, -150);
});

test("every category has a label and a color, and no two categories share a color", () => {
  const keys = [...CATEGORIES, PAID_BACK_CATEGORY];
  for (const k of keys) {
    assert.ok(CATEGORY_STYLE[k as keyof typeof CATEGORY_STYLE], `missing style for ${k}`);
    assert.ok(CATEGORY_STYLE[k as keyof typeof CATEGORY_STYLE].label.length > 0);
  }
  assert.equal(Object.keys(CATEGORY_STYLE).length, keys.length, "style table has an entry that is not a category");
  const colors = keys.map((k) => CATEGORY_STYLE[k as keyof typeof CATEGORY_STYLE].bg);
  assert.equal(new Set(colors).size, colors.length, "two categories share a color");
});

test("category labels are plain words and unknown categories fall back to Other", () => {
  assert.equal(categoryStyle("food").label, "Food and drink");
  assert.equal(categoryStyle("entertainment").label, "Fun");
  assert.equal(categoryStyle("hangout").label, "Hangouts");
  assert.equal(categoryStyle("paid back").label, "Paid back");
  assert.equal(categoryStyle("nightlife").label, "Other");
  assert.equal(categoryStyle("food").bg, CATEGORY_STYLE.food.bg, "same color every time");
});

test("category colors use design tokens only", () => {
  const allowed = new Set(["orchid", "matcha", "peach", "azure", "secondary", "indigo", "maroon", "inactive", "pistachio", "mint", "sage", "deep"]);
  for (const s of Object.values(CATEGORY_STYLE)) assert.ok(allowed.has(s.bg.replace("bg-", "")), s.bg);
});

test("relative day labels", () => {
  assert.equal(relativeDay("2026-10-24", TODAY), "Today");
  assert.equal(relativeDay("2026-10-23", TODAY), "Yesterday");
  assert.equal(relativeDay("2026-10-22", TODAY), "Thu"); // 2026-10-22 is a Thursday
  assert.equal(relativeDay("2026-10-18", TODAY), "Sun"); // 6 days ago still a weekday
  assert.equal(relativeDay("2026-10-17", TODAY), "Oct 17"); // 7 days ago is a date
  assert.equal(relativeDay("2026-10-12", TODAY), "Oct 12");
  assert.equal(relativeDay("2026-09-28", TODAY), "Sep 28");
  assert.equal(relativeDay("2025-12-05", "2026-01-02"), "Dec 5");
  assert.equal(relativeDay("2026-02-27", "2026-03-01"), "Fri"); // across a month end (Feb 27 2026 is a Friday)
});

test("money formatting: whole dollars stay whole, cents show two digits, sign is explicit", () => {
  assert.equal(formatMoney(470), "$470");
  assert.equal(formatMoney(16.4), "$16.40");
  assert.equal(formatMoney(1234.5), "$1,234.50");
  assert.equal(formatMoney(-190), "$190");
  assert.equal(formatSigned(-16.4), "-$16.40");
  assert.equal(formatSigned(24), "+$24");
  assert.equal(formatSigned(0), "$0");
});
