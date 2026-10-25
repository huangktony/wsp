import test from "node:test";
import assert from "node:assert/strict";
import { REDRAW_MESSAGES, currentVotes, redrawGate, redrawThreshold, shouldRedraw } from "../lib/redrawRules";

test("threshold is more than half of the members, for 1 to 5", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(redrawThreshold), [1, 2, 2, 3, 3]);
  assert.equal(redrawThreshold(0), 1, "an empty group still needs one vote, never zero");
  assert.equal(redrawThreshold(10), 6);
});

test("a redraw starts exactly when the votes reach the threshold", () => {
  assert.equal(shouldRedraw(1, 1), true);
  assert.equal(shouldRedraw(1, 2), false);
  assert.equal(shouldRedraw(2, 2), true);
  assert.equal(shouldRedraw(1, 3), false);
  assert.equal(shouldRedraw(2, 3), true);
  assert.equal(shouldRedraw(2, 4), false);
  assert.equal(shouldRedraw(3, 4), true);
  assert.equal(shouldRedraw(0, 3), false);
});

test("votes from people who left the group do not count, and nobody counts twice", () => {
  assert.equal(currentVotes([1, 2, 9], [1, 2, 3]), 2); // 9 left
  assert.equal(currentVotes([1, 1, 2], [1, 2, 3]), 2);
  assert.equal(currentVotes([], [1, 2]), 0);
  assert.equal(currentVotes([7, 8], [1, 2]), 0);
  // A leaver's vote cannot push a group over the line.
  assert.equal(shouldRedraw(currentVotes([1, 9, 8], [1, 2, 3, 4]), 4), false);
});

test("a redraw is blocked unless the round is final, and blocked after the requests were sent", () => {
  assert.equal(redrawGate({ status: "final", requests_sent: false }), "ok");
  assert.equal(redrawGate({ status: "final", requests_sent: true }), "locked");
  for (const status of ["voting", "generating", "vetoed", "failed", "redrawn"]) assert.equal(redrawGate({ status, requests_sent: false }), "not_final", status);
  assert.equal(redrawGate(null), "not_final");
  assert.equal(redrawGate(undefined), "not_final");
});

test("the messages the server and screen show", () => {
  assert.equal(REDRAW_MESSAGES.locked, "Plan locked: payment requests were sent.");
  assert.match(REDRAW_MESSAGES.not_final, /no final plan/);
});
