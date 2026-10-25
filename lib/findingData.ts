import { q, q1 } from "@/lib/db";
import { bestSlot } from "./finding";

/** Only aggregate preferences leave the server. Includes failed rounds so clients can stop waiting. */
export async function getFindingDetails(groupId: number) {
  const members = await q<{ availability: string[]; max_distance_mi: number }>(
    "select m.availability,u.max_distance_mi from memberships m join users u on u.id=m.user_id where m.group_id=$1 order by m.joined_at", [groupId]);
  const round = await q1<{ id: number; status: string; slot: string | null; group_tier: string | null; plan_count: number }>(
    `select r.id,r.status,r.slot,r.group_tier,(select count(*)::int from plans p where p.round_id=r.id) plan_count
     from plan_rounds r where r.group_id=$1 order by r.id desc limit 1`, [groupId]);
  const ready = members.filter(member => member.availability.length);
  const distances = members.map(member => member.max_distance_mi).filter(Number.isFinite);
  return {
    round, planCount: round?.plan_count ?? 0, memberCount: members.length,
    slot: round?.slot ?? (ready.length ? bestSlot(ready.map(member => member.availability)).slot : null),
    maxDistanceMi: distances.length ? Math.min(...distances) : null,
  };
}
