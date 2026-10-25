// Pure rules for the group vote to redraw a final plan (no I/O).

/** More than half of the current members: 1 of 1, 2 of 2, 2 of 3, 3 of 4, 3 of 5. */
export const redrawThreshold = (members: number) => Math.floor(Math.max(members, 1) / 2) + 1;

export const shouldRedraw = (votes: number, members: number) => votes >= redrawThreshold(members);

/** Votes from people who are no longer in the group do not count. Each person counts once. */
export const currentVotes = (voterIds: number[], memberIds: number[]) => new Set(voterIds.filter((v) => memberIds.includes(v))).size;

export type RedrawGate = "ok" | "not_final" | "locked";

/** A redraw is only possible on a FINAL round whose payment requests have not been sent. */
export function redrawGate(round: { status: string; requests_sent: boolean } | null | undefined): RedrawGate {
  if (!round || round.status !== "final") return "not_final";
  return round.requests_sent ? "locked" : "ok";
}

export const REDRAW_MESSAGES: Record<Exclude<RedrawGate, "ok">, string> = {
  not_final: "There is no final plan to redraw.",
  locked: "Plan locked: payment requests were sent.",
};
