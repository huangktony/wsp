import test from "node:test";
import assert from "node:assert/strict";
import { ballotComplete, chooseWinner, isRemoved, majority, shouldClose } from "../lib/votingRules";

test("a plan is removed once more than half of the current members veto it", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(majority), [1, 2, 2, 3, 3]);
  assert.equal(isRemoved(1, 3), false);
  assert.equal(isRemoved(2, 3), true);
  assert.equal(isRemoved(2, 4), false, "half is not a majority");
  assert.equal(isRemoved(3, 4), true);
  assert.equal(isRemoved(0, 0), false);
});

test("a ballot can be confirmed only with a vote on every plan still in the running", () => {
  assert.equal(ballotComplete(["approve", "pass"]), true);
  assert.equal(ballotComplete(["approve", null]), false);
  assert.equal(ballotComplete(["approve", undefined]), false);
  assert.equal(ballotComplete([]), false);
});

test("voting closes at the deadline, on force, when everyone confirmed, or when every plan is removed", () => {
  const base = { force: false, expired: false, members: 3, confirmed: 2, remaining: 2 };
  assert.equal(shouldClose(base), false);
  assert.equal(shouldClose({ ...base, confirmed: 3 }), true);
  assert.equal(shouldClose({ ...base, expired: true }), true);
  assert.equal(shouldClose({ ...base, force: true }), true);
  assert.equal(shouldClose({ ...base, remaining: 0 }), true);
});

test("the winner reflects the votes: most approvals, then fewest vetoes, then cheapest", () => {
  const plan = (id: number, approves: number, vetoes: number, cost = 20) => ({ id, cost, approves, vetoes });
  assert.equal(chooseWinner([plan(1, 1, 0), plan(2, 2, 1)], 4), 2);
  assert.equal(chooseWinner([plan(1, 2, 1), plan(2, 2, 0)], 4), 2);
  assert.equal(chooseWinner([plan(1, 2, 0, 30), plan(2, 2, 0, 10)], 4), 2);
  assert.equal(chooseWinner([plan(1, 2, 0), plan(2, 2, 0)], 4), 1);
});

test("removed plans and plans nobody approved cannot win", () => {
  const plan = (id: number, approves: number, vetoes: number) => ({ id, cost: 10, approves, vetoes });
  // Plan 1 has the most approvals but a majority (3 of 5) vetoed it.
  assert.equal(chooseWinner([plan(1, 2, 3), plan(2, 1, 0)], 5), 2);
  // No plan was approved: the round is vetoed instead of picking an unvoted plan.
  assert.equal(chooseWinner([plan(1, 0, 0), plan(2, 0, 1)], 3), null);
  assert.equal(chooseWinner([plan(1, 1, 2), plan(2, 1, 2)], 3), null);
});
