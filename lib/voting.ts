import { includedInRound, type InclusionRound } from "./roundParticipation";
import { q } from "@/lib/db";

/** Participation means at least one saved vote, not a completed ballot. */
export async function getVotingParticipation(groupId: number, round: { id: number; status: string } & InclusionRound | null) {
  const participation = await q<{ user_id: number; has_voted: boolean }>(
    `select m.user_id, exists (
       select 1 from votes v join plans p on p.id=v.plan_id
       where v.user_id=m.user_id and p.round_id=$2
     ) has_voted
     from memberships m where m.group_id=$1`, [groupId, round?.id ?? null]);
  const included = participation.filter(member => includedInRound(round, member.user_id));
  const votedMemberIds = included.filter(member => member.has_voted).map(member => member.user_id);
  return {
    voted: votedMemberIds.length,
    memberCount: included.length,
    roundOpen: round?.status === "voting",
    votedMemberIds,
  };
}
