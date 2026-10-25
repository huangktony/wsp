"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { mySetupDone, shouldFindPlans, type FindingState } from "./finding";

export function useFindingRedirect(id: string, group: Parameters<typeof shouldFindPlans>[0]) {
  const router = useRouter();
  const previous = useRef<FindingState | null>(null);
  const pushed = useRef(false);
  useEffect(() => {
    if (!group || !mySetupDone(group)) return;
    if (!pushed.current && shouldFindPlans(group, previous.current)) {
      pushed.current = true;
      router.push(`/groups/${id}/finding`);
    }
    previous.current = group.finding ?? null;
  }, [group, id, router]);
}
