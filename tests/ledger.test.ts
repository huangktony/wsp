import test from "node:test";
import assert from "node:assert/strict";
import { ledgerDollars, parseSplitDescription, pendingHalves, splitAccounts, splitDescription } from "../lib/ledger";

test("description round-trip: build then parse gives back the same fields", () => {
  const d = splitDescription({ payId: 42, counterpart: "acct-123", cents: 1833, label: "Friday Crew hangout" });
  assert.equal(d, "WSP split|pay=42|acct=acct-123|cents=1833|Friday Crew hangout");
  assert.deepEqual(parseSplitDescription(d), { payId: 42, acct: "acct-123", cents: 1833, label: "Friday Crew hangout" });
});

test("a pipe in the label cannot break the format", () => {
  const d = splitDescription({ payId: 7, counterpart: "a|b", cents: 500, label: "tacos | drinks" });
  const m = parseSplitDescription(d)!;
  assert.equal(m.payId, 7);
  assert.equal(m.cents, 500);
  assert.equal(m.acct, "a/b");
  assert.equal(m.label, "tacos / drinks");
});

test("rows that do not start with 'WSP split|' are never parsed", () => {
  assert.equal(parseSplitDescription("Torchy's Tacos"), null);
  assert.equal(parseSplitDescription("hello WSP split|pay=1|acct=x|cents=1|y"), null);
  assert.equal(parseSplitDescription(""), null);
  assert.equal(parseSplitDescription(undefined), null);
  assert.equal(parseSplitDescription(null), null);
});

test("missing or garbage cents fall back to the row's own amount", () => {
  assert.equal(parseSplitDescription("WSP split|pay=3|acct=x|label")!.cents, null);
  assert.equal(parseSplitDescription("WSP split|pay=3|acct=x|cents=abc|label")!.cents, null);
  assert.equal(parseSplitDescription("WSP split|pay=3|acct=x|cents=-5|label")!.cents, null);
  assert.equal(parseSplitDescription("WSP split|pay=3|acct=x|cents=12.5|label")!.cents, null);
  assert.equal(ledgerDollars({ amount: 18, description: "WSP split|pay=3|acct=x|cents=zzz|l" }), 18);
  assert.equal(ledgerDollars({ amount: 18, description: "WSP split|pay=3|acct=x|l" }), 18);
  assert.equal(ledgerDollars({ amount: 18, description: "not ours" }), 18);
  assert.equal(ledgerDollars({ amount: 18 }), 18);
});

test("exact cents win over Nessie's whole-dollar amount", () => {
  assert.equal(ledgerDollars({ amount: 18, description: "WSP split|pay=3|acct=x|cents=1833|l" }), 18.33);
  assert.equal(ledgerDollars({ amount: 0, description: "WSP split|pay=3|acct=x|cents=50|l" }), 0.5);
});

test("a row without a usable pay id or account is not ours", () => {
  assert.equal(parseSplitDescription("WSP split|acct=x|cents=1|l"), null);
  assert.equal(parseSplitDescription("WSP split|pay=abc|acct=x|cents=1|l"), null);
  assert.equal(parseSplitDescription("WSP split|pay=0|acct=x|cents=1|l"), null);
  assert.equal(parseSplitDescription("WSP split|pay=5|cents=1|l"), null);
});

const row = (payId: number) => ({ description: splitDescription({ payId, counterpart: "x", cents: 100, label: "l" }) });

test("idempotency: nothing posted yet means both halves are needed", () => {
  assert.deepEqual(pendingHalves([], [], 9), { needWithdrawal: true, needDeposit: true });
});

test("idempotency: an existing withdrawal for this payment means only the deposit is posted", () => {
  assert.deepEqual(pendingHalves([row(9)], [], 9), { needWithdrawal: false, needDeposit: true });
});

test("idempotency: an existing deposit means only the withdrawal is posted, and both means nothing", () => {
  assert.deepEqual(pendingHalves([], [row(9)], 9), { needWithdrawal: true, needDeposit: false });
  assert.deepEqual(pendingHalves([row(9)], [row(9)], 9), { needWithdrawal: false, needDeposit: false });
});

test("idempotency: rows for other payments or unrelated rows do not count", () => {
  assert.deepEqual(pendingHalves([row(8), { description: "Torchy's" }, {}], [row(10)], 9), { needWithdrawal: true, needDeposit: true });
  assert.deepEqual(pendingHalves([row(19)], [row(91)], 9), { needWithdrawal: true, needDeposit: true }); // 19 and 91 are not 9
});

test("splitAccounts lists each counterpart once and ignores other rows", () => {
  const rows = [
    { description: "WSP split|pay=1|acct=A|cents=100|l" }, { description: "WSP split|pay=2|acct=A|cents=100|l" },
    { description: "WSP split|pay=3|acct=B|cents=100|l" }, { description: "Torchy's" }, {},
  ];
  assert.deepEqual(splitAccounts(rows).sort(), ["A", "B"]);
});
