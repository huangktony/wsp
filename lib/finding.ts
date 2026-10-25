/** Compare saved city labels without treating whitespace/case edits as a new location. */
export const sameCity = (a: string | null | undefined, b: string | null | undefined) =>
  !!a?.trim() && !!b?.trim() && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Only pre-snapshot rounds use this agreed legacy location. Never use for new rounds. */
export const LEGACY_ROUND_CITY = "Austin, TX";
export const LEGACY_ROUND_COORDS = { lat: 30.2672, lng: -97.7431 } as const;

export function resolveRoundCity(round: { search_city?: string | null }, group?: { city: string; lat: number; lng: number }) {
  if (round.search_city == null) return { city: LEGACY_ROUND_CITY, coords: LEGACY_ROUND_COORDS };
  return {
    city: round.search_city,
    coords: group && sameCity(round.search_city, group.city) ? { lat: group.lat, lng: group.lng } : undefined,
  };
}

export type FindingState = {
  round: { id: number; status: string } | null;
  planCount: number;
  cityChanged?: boolean;
  needsNewSearch?: boolean;
};

/** Availability is the setup requirement; interests and bank linking are optional. */
export function shouldFindPlans(group: { members: { setup_done: boolean }[]; finding?: FindingState } | null, previous?: FindingState | null) {
  if (!group?.finding || !group.members.length || !group.members.every(member => member.setup_done)) return false;
  const current = group.finding;
  if (current.cityChanged || current.needsNewSearch) return false; // The member explicitly starts a replacement round.
  return !current.round || current.round.status === "generating" ||
    // A fast generation may finish between polls. Follow that new round too.
    (!!previous && previous.round?.id !== current.round.id && current.round.status === "voting");
}

export function bestSlot(avails: string[][]): { slot: string; free: number } {
  const count = new Map<string, number>();
  for (const a of avails) for (const s of a) count.set(s, (count.get(s) ?? 0) + 1);
  const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
  return top ? { slot: top[0], free: top[1] } : { slot: "Sat evening", free: avails.length };
}
