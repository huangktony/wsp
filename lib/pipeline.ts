/*
 * Plan round lifecycle (plan_rounds.status):
 *   generating -> voting -> final      (a plan won)
 *                        -> vetoed     (no plan was approved, or a majority vetoed every plan; next round leaves vetoed places out)
 *   generating -> failed               (generation crashed or stalled)
 *   generating/voting -> superseded    (a new search replaced this attempt)
 * During voting a plan a majority vetoed is removed, and each member's votes are final once they confirm them.
 * After final, the creator confirms the plan (confirmed_at), then the payer (group creator) picks even / by item split
 * and sends requests (requests_sent).
 */

/**
 * Closes voting when the deadline passed, every included member confirmed their votes,
 * every plan was removed by a majority veto, or `force` (creator's "close now").
 * Safe to call on every poll: the status check in the update makes it run once.
 * Only the group's current round can be settled, and only members included in the round count
 * toward the majority and the "everyone confirmed" check. The winner comes from chooseWinner.
 */
export async function settleRound(
  roundId: number,
  force = false,
): Promise<string> {
  const r = await q1<any>(
    `select r.id,r.status,r.group_id,(r.vote_deadline < now()) expired,
       (select count(*)::int
        from memberships m
        where m.group_id=r.group_id
          and ${includedVoteSql("r", "m.user_id")}) members
     from plan_rounds r
     where r.id=$1
       and r.id=(
         select latest.id
         from plan_rounds latest
         where latest.group_id=r.group_id
         order by (latest.status='final') desc,latest.id desc
         limit 1
       )`,
    [roundId],
  );

  if (!r || r.status !== "voting") return r?.status ?? "missing";

  const tallies = await planTallies(roundId);
  const remaining = tallies.filter((p) => !isRemoved(p.vetoes, r.members)).length;
  const confirmed = (await confirmedMemberIds(roundId)).length;
  if (!shouldClose({ force, expired: r.expired, members: r.members, confirmed, remaining })) return "voting";

  const winner = chooseWinner(tallies, r.members);

  if (winner == null) {
    // Leave out the places the group vetoed. If nobody vetoed anything (nobody voted), keep them all available.
    const vetoed = tallies.filter((p) => p.vetoes > 0).map((p) => p.id);
    const names = await q<{ place: string }>(
      "select distinct s->>'place' place from plans p, jsonb_array_elements(p.stops) s where p.id = any($1::int[])",
      [vetoed],
    );
    const done = await q1(
      "update plan_rounds set status='vetoed', excluded=excluded || $2::text[] where id=$1 and status='voting' returning id",
      [roundId, names.map((n) => n.place)],
    );
    return done
      ? "vetoed"
      : (
          await q1<any>(
            "select status from plan_rounds where id=$1",
            [roundId],
          )
        ).status;
  }

  await q(
    "update plan_rounds set status='final', winner_plan_id=$2, payer_id=(select created_by from groups where id=$3) where id=$1 and status='voting'",
    [roundId, winner, r.group_id],
  );
  return (
    await q1<any>("select status from plan_rounds where id=$1", [roundId])
  ).status;
}