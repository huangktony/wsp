export type FindingState = {
  round: { id: number; status: string } | null;
  planCount: number;
};

/** Availability is the setup requirement; interests and bank linking are optional. */
export function shouldFindPlans(group: { members: { setup_done: boolean }[]; finding?: FindingState } | null, previous?: FindingState | null) {
  if (!group?.finding || !group.members.length || !group.members.every(member => member.setup_done)) return false;
  const current = group.finding;
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
