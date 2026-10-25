import { normalizeAvailability, chooseTime } from "./availability";
import { searchPreferences, settingsChanged, type SearchMember } from "./roundSettings";
import { q, q1 } from "@/lib/db";
import { bestSlot, resolveRoundCity, sameCity } from "./finding";

/** Only aggregate preferences leave the server. Includes failed rounds so clients can stop waiting. */
export async function getFindingDetails(groupId: number, currentCity: string) {
  const members = await q<SearchMember>(
    "select m.user_id,m.availability,m.comfort_tier,u.name,u.budget_tier,u.interests,u.max_distance_mi,to_jsonb(m)->'preferences' preferences from memberships m join users u on u.id=m.user_id where m.group_id=$1 order by m.joined_at", [groupId]);
  const round = await q1<{ search_settings: SearchMember[] | null; id: number; status: string; slot: string | null; group_tier: string | null; plan_count: number; search_city: string | null; sample_places: boolean | null; search_error: string | null; search_distance_mi: number | null }>(
    `select r.id,r.status,to_jsonb(r)->'search_settings' search_settings,r.slot,r.group_tier,to_jsonb(r)->>'search_city' search_city,(to_jsonb(r)->>'sample_places')::boolean sample_places,to_jsonb(r)->>'search_error' search_error,(to_jsonb(r)->>'search_distance_mi')::int search_distance_mi,(select count(*)::int from plans p where p.round_id=r.id) plan_count
     from plan_rounds r where r.group_id=$1 order by (r.status='final') desc,r.id desc limit 1`, [groupId]);
  if (round) round.search_city = resolveRoundCity(round).city;
  const ready = members.filter(member => normalizeAvailability(member.availability).length);
  const preferences = searchPreferences(members);
  const stale = !!round && settingsChanged(round.search_settings, members);
  // Never expose individual financial preferences in the group response.
  const publicRound = round ? (({ search_settings, ...rest }) => rest)(round) : null;
  const timeMatch = round?.search_settings?.[0]?.time_match ?? chooseTime(ready);
  return {
    timeMatch,
    settingsChanged: stale,
    needsNewSearch: !!round && (stale || !sameCity(round.search_city, currentCity) || (round.sample_places ?? false) !== (process.env.USE_SAMPLE_PLACES === "true")),
    cityChanged: !!round && !sameCity(round.search_city, currentCity),
    city: round ? resolveRoundCity(round).city : currentCity,
    round: publicRound, planCount: round?.plan_count ?? 0, memberCount: members.length,
    slot: round?.slot ?? (ready.length ? bestSlot(ready.map(member => member.availability)).slot : null),
    maxDistanceMi: round?.search_distance_mi ?? preferences.distance,
  };
}
