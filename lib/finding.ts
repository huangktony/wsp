import { chooseTime } from "./availability";
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
export function shouldFindPlans(group: { me?: number; members: { id?: number; setup_done: boolean }[]; finding?: FindingState } | null, previous?: FindingState | null) {
  if (!group?.finding || !group.members.length || !group.members.every(member => member.setup_done)) return false;
  const current = group.finding;
  if (current.cityChanged || current.needsNewSearch) return false; // The member explicitly starts a replacement round.
  return !current.round || current.round.status === "generating" ||
    // A fast generation may finish between polls. Follow that new round too.
    (!!previous && previous.round?.id !== current.round.id && current.round.status === "voting");
}

export function bestSlot(avails: string[][]): { slot: string; free: number } {
  const chosen = chooseTime(avails.map(availability => ({ availability })));
  return { slot: chosen?.slot ?? "", free: chosen?.free ?? 0 };
}


/** Latest-round action; legacy city metadata and settings changes do not determine the label. */
export function groupHomeAction(round: { status: string } | null | undefined, planCount: number) {
  if (round?.status === "generating") return { label: "Finding plans…", destination: "finding", fresh: false, final: false } as const;
  if (!round || round.status === "failed" || planCount === 0) return { label: "Find plans", destination: "finding", fresh: false, final: false } as const;
  if (round.status === "final" || round.status === "confirmed") return { label: "Find new plans", destination: "finding", fresh: true, final: true } as const;
  if (round.status === "vetoed") return { label: "Find new plans", destination: "finding", fresh: true, final: false } as const;
  if (round.status === "voting") return { label: "Vote on plans", destination: "plans", fresh: false, final: false } as const;
  return { label: "Find plans", destination: "finding", fresh: false, final: false } as const;
}

export const SETUP_REQUIRED_MESSAGE = "You haven't made your setup yet. Make your setup first, then find plans.";

export function mySetupDone(group: { me?: number; members: { id?: number; setup_done: boolean }[] } | null | undefined) {
  return group?.me != null && group.members.some(member => member.id === group.me && member.setup_done);
}

export function setupButtonLabel(complete: boolean) {
  return complete ? "Edit my setup" : "Make my setup";
}

export type GroupDestination = { id: number | string; round_status?: string | null; round?: { status: string } | null };
export function groupHref(group: GroupDestination) {
  const status = group.round_status ?? group.round?.status;
  return `/groups/${group.id}${status === "final" ? "/final" : status === "voting" ? "/plans" : ""}`;
}
export function groupHomeRedirect(group: GroupDestination | null | undefined, home?: string | null) {
  return group && home !== "1" && (group.round_status ?? group.round?.status) === "final" ? groupHref(group) : null;
}
