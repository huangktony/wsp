// Pure rules for voting on a round's plans (no I/O). Only current members' votes are ever passed in.

export type Tally = { id: number; cost: number; approves: number; vetoes: number };

/** More than half of the current members: 1 of 1, 2 of 2, 2 of 3, 3 of 4, 3 of 5. */
export const majority = (members: number) => Math.floor(Math.max(members, 1) / 2) + 1;

/** A plan a majority vetoed is out of the running: nobody can vote on it and it cannot win. */
export const isRemoved = (vetoes: number, members: number) => vetoes >= majority(members);

/** A ballot can be confirmed once it has a vote on every plan still in the running. */
export const ballotComplete = (myVotes: (string | null | undefined)[]) => myVotes.length > 0 && myVotes.every((v) => v != null);

/** Voting closes at the deadline, on the creator's "close now", once every member confirmed, or when every plan was removed. */
export const shouldClose = (r: { force: boolean; expired: boolean; members: number; confirmed: number; remaining: number }) =>
  r.force || r.expired || r.remaining === 0 || r.confirmed >= r.members;

/**
 * Most approvals wins; then fewest vetoes; ties go to lower cost, then the older plan.
 * Removed plans and plans nobody approved cannot win. null means no plan won and the round is vetoed.
 */
export function chooseWinner(plans: Tally[], members: number): number | null {
  const ranked = plans
    .filter((p) => p.approves > 0 && !isRemoved(p.vetoes, members))
    .sort((a, b) => b.approves - a.approves || a.vetoes - b.vetoes || a.cost - b.cost || a.id - b.id);
  return ranked[0]?.id ?? null;
}
