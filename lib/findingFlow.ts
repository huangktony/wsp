import { api } from "./client";

export type FindingGroup = {
  groupTier: string | null;
  finding: {
    memberCount: number; maxDistanceMi: number | null; slot: string | null; planCount: number;
    round: { id: number; status: string; group_tier: string | null } | null;
  };
};
export function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

/** The server owns generation. This client only claims once and observes its round. */
export async function runFinding(id: string, signal: AbortSignal, callbacks: {
  update: (group: FindingGroup) => void; started: () => void; ready: () => void;
}, dependencies = { api, wait, now: Date.now }) {
  const { api: request, wait: pause, now } = dependencies;
  const read = () => request<FindingGroup>(`/api/groups/${id}`, "GET", undefined, signal);
  let group = await read();
  signal.throwIfAborted();
  callbacks.update(group);
  const round = group.finding.round;
  if (group.finding.planCount > 0 && (round?.status === "voting" || round?.status === "final")) {
    callbacks.ready();
    return;
  }
  const began = now();
  callbacks.started();
  const claim = round?.status === "generating"
    ? { roundId: round.id }
    : await request<{ roundId: number }>(`/api/groups/${id}/plans`, "POST", undefined, signal);
  while (true) {
    signal.throwIfAborted();
    group = await read();
    signal.throwIfAborted();
    callbacks.update(group);
    const current = group.finding.round;
    if (current?.status === "failed") throw new Error("Couldn't make plans this time. Try again.");
    if (current?.id === claim.roundId && group.finding.planCount > 0 && ["voting", "final", "vetoed"].includes(current.status)) break;
    await pause(1500, signal);
  }
  await pause(Math.max(0, 4200 - (now() - began)), signal);
  signal.throwIfAborted();
  callbacks.ready();
}
