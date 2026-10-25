import { isTier, lowestTier } from "./tiers";

export type SearchMember = {
  user_id: number; availability: string[]; interests: string[]; max_distance_mi: number;
  comfort_tier: string | null; budget_tier: string | null;
};
/** Canonical snapshot: includes every member so joining, leaving, or editing any setting invalidates it. */
export function roundSettings(members: SearchMember[]) {
  return members.map(m => ({
    included: !!m.availability?.length, user_id: m.user_id, availability: [...(m.availability ?? [])].sort(), interests: [...(m.interests ?? [])].sort(),
    max_distance_mi: m.max_distance_mi, comfort_tier: m.comfort_tier ?? null, budget_tier: m.budget_tier ?? null,
  })).sort((a, b) => a.user_id - b.user_id);
}
export function settingsChanged(saved: SearchMember[] | null | undefined, current: SearchMember[]) {
  return !saved || JSON.stringify(roundSettings(saved)) !== JSON.stringify(roundSettings(current));
}
export function searchPreferences(members: SearchMember[]) {
  const ready = members.filter(m => m.availability?.length);
  const distances = ready.map(m => m.max_distance_mi).filter(n => Number.isFinite(n) && n > 0);
  return {
    distance: distances.length ? Math.min(...distances) : null,
    tier: lowestTier(ready.map(m => isTier(m.comfort_tier) ? m.comfort_tier : m.budget_tier)),
  };
}
