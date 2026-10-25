import { q, q1 } from "@/lib/db";
import type { Tally } from "@/lib/votingRules";

export class VotingSchemaPendingError extends Error {
  constructor() {
    super("Confirming needs a database update. Ask the group organizer to apply the vote confirmation migration.");
  }
}

let schemaReady = false;

/**
 * vote_confirmations and plan_rounds.confirmed_at come from db/migrations/20261025_vote_confirmations.sql.
 * Until it is applied, reads see nobody confirmed and confirming fails with VotingSchemaPendingError.
 */
export async function votingSchemaReady() {
  if (!schemaReady) {
    const row = await q1<{ ok: boolean }>(
      `select to_regclass('vote_confirmations') is not null and exists (
         select 1 from information_schema.columns where table_name='plan_rounds' and column_name='confirmed_at'
       ) ok`);
    schemaReady = !!row?.ok;
  }
  return schemaReady;
}

/** Approve and veto counts per plan, counting only people who are still in the group. */
export async function planTallies(roundId: number): Promise<Tally[]> {
  return q<Tally>(
    `select p.id, p.est_cost_per_person::float cost,
       count(m.user_id) filter (where v.value='approve')::int approves,
       count(m.user_id) filter (where v.value='pass')::int vetoes
     from plans p join plan_rounds r on r.id=p.round_id
     left join votes v on v.plan_id=p.id
     left join memberships m on m.user_id=v.user_id and m.group_id=r.group_id
     where p.round_id=$1 group by p.id order by p.id`, [roundId]);
}

/** Current members who confirmed their votes in this round. Confirmed votes are final. */
export async function confirmedMemberIds(roundId: number | null): Promise<number[]> {
  if (roundId == null || !(await votingSchemaReady())) return [];
  const rows = await q<{ user_id: number }>(
    `select c.user_id from vote_confirmations c join plan_rounds r on r.id=c.round_id
     join memberships m on m.user_id=c.user_id and m.group_id=r.group_id where c.round_id=$1`, [roundId]);
  return rows.map((row) => row.user_id);
}

/** Participation means at least one saved vote, not a completed ballot. Confirming is counted separately. */
export async function getVotingParticipation(groupId: number, round: { id: number; status: string } | null) {
  const participation = await q<{ user_id: number; has_voted: boolean }>(
    `select m.user_id, exists (
       select 1 from votes v join plans p on p.id=v.plan_id
       where v.user_id=m.user_id and p.round_id=$2
     ) has_voted
     from memberships m where m.group_id=$1`, [groupId, round?.id ?? null]);
  const votedMemberIds = participation.filter(member => member.has_voted).map(member => member.user_id);
  const confirmed = await confirmedMemberIds(round?.id ?? null);
  return {
    voted: votedMemberIds.length,
    confirmed: confirmed.length,
    memberCount: participation.length,
    roundOpen: round?.status === "voting",
    votedMemberIds,
    confirmedMemberIds: confirmed,
  };
}
