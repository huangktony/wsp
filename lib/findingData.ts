import { q, q1 } from "@/lib/db";
import { bestSlot, resolveRoundCity, sameCity } from "./finding";

/** Only aggregate preferences leave the server. Includes failed rounds so clients can stop waiting. */
export async function getFindingDetails(groupId: number, currentCity: string) {
  const members = await q<{ availability: string[]; max_distance_mi: number }>(
    "select m.availability,u.max_distance_mi from memberships m join users u on u.id=m.user_id where m.group_id=$1 order by m.joined_at", [groupId]);
  const round = await q1<{ id: number; status: string; slot: string | null; group_tier: string | null; plan_count: number; search_city: string | null; sample_places: boolean | null; search_error: string | null; search_distance_mi: number | null }>(
    `select r.id,r.status,r.slot,r.group_tier,to_jsonb(r)->>'search_city' search_city,(to_jsonb(r)->>'sample_places')::boolean sample_places,to_jsonb(r)->>'search_error' search_error,(to_jsonb(r)->>'search_distance_mi')::int search_distance_mi,(select count(*)::int from plans p where p.round_id=r.id) plan_count
     from plan_rounds r where r.group_id=$1 order by r.id desc limit 1`, [groupId]);
  if (round) round.search_city = resolveRoundCity(round).city;
  const ready = members.filter(member => member.availability.length);
  const distances = members.map(member => member.max_distance_mi).filter(Number.isFinite);
  return {
    needsNewSearch: !!round && (!sameCity(round.search_city, currentCity) || (round.sample_places ?? false) !== (process.env.USE_SAMPLE_PLACES === "true")),
    cityChanged: !!round && !sameCity(round.search_city, currentCity),
    city: round ? resolveRoundCity(round).city : currentCity,
    round, planCount: round?.plan_count ?? 0, memberCount: members.length,
    slot: round?.slot ?? (ready.length ? bestSlot(ready.map(member => member.availability)).slot : null),
    maxDistanceMi: round?.search_distance_mi ?? (distances.length ? Math.min(...distances) : null),
  };
}
