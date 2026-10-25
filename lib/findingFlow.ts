import { mySetupDone, SETUP_REQUIRED_MESSAGE } from "./finding";
import type { Redraw } from "@/components/RedrawVote";
import { api } from "./client";

export type FindingGroup = {
  redraw?: Redraw | null;
  me: number;
  members: { id: number; setup_done: boolean }[];
  groupTier: string | null;
  finding: {
    cityChanged?: boolean;
    needsNewSearch?: boolean;
    city?: string;
    memberCount: number;
    maxDistanceMi: number | null;
    slot: string | null;
    planCount: number;
    round: {
      id: number;
      status: string;
      group_tier: string | null;
      sample_places?: boolean;
      search_error?: string | null;
    } | null;
  };
};

export function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);

    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

/** The server owns generation. This client only claims once and observes its round. */
export async function runFinding(
  id: string,
  signal: AbortSignal,
  callbacks: {
    update: (group: FindingGroup) => void;
    started: () => void;
    ready: () => void;
    redraw?: () => void;
  },
  dependencies = { api, wait, now: Date.now },
  requestNew = false,
) {
  const { api: request, wait: pause, now } = dependencies;
  const read = () =>
    request<FindingGroup>(`/api/groups/${id}`, "GET", undefined, signal);

  let group = await read();
  signal.throwIfAborted();
  if (!mySetupDone(group)) throw new Error(SETUP_REQUIRED_MESSAGE);
  callbacks.update(group);

  const round = group.finding.round;
  const needsNewSearch =
    group.finding.cityChanged || group.finding.needsNewSearch;

  if (round?.status === "final" && requestNew) {
    callbacks.redraw?.();
    return;
  }

  // Final plans must go through the group redraw flow.
  // Voting plans can be reused while their search settings remain current.
  if (
    group.finding.planCount > 0 &&
    (round?.status === "final" ||
      (round?.status === "voting" && !needsNewSearch))
  ) {
    callbacks.ready();
    return;
  }

  const began = now();
  callbacks.started();

  // Always let the server validate/recover a generating round under its lock.
  const claim = await request<{ roundId: number }>(
    `/api/groups/${id}/plans`, "POST", undefined, signal,
  );

  const pollingBegan = now();
  while (true) {
    signal.throwIfAborted();
    if (now() - pollingBegan >= 120000) {
      throw new Error("Finding plans took too long. Try again.");
    }
    group = await read();
    signal.throwIfAborted();
    if (!mySetupDone(group)) throw new Error(SETUP_REQUIRED_MESSAGE);
    callbacks.update(group);

    const current = group.finding.round;
    if (!current || current.id !== claim.roundId ||
        (current.status !== "final" && (group.finding.cityChanged || group.finding.needsNewSearch))) {
      throw new Error("The search changed while finding plans. Try again to see the latest plans.");
    }

    if (current?.id === claim.roundId && current.status === "failed") {
      throw new Error(
        current.search_error || "Couldn't make plans this time. Try again.",
      );
    }

    if (
      current?.id === claim.roundId &&
      group.finding.planCount > 0 &&
      ["voting", "final", "vetoed"].includes(current.status)
    ) {
      break;
    }

    await pause(1500, signal);
  }

  await pause(Math.max(0, 4200 - (now() - began)), signal);
  signal.throwIfAborted();
  callbacks.ready();
}
