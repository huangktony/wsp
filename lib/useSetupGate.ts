"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "./client";

/** Sends a member who hasn't finished setup for this group to the setup screen. Setup can't be skipped. */
export function useSetupGate(id: string) {
  const router = useRouter();
  useEffect(() => {
    const ctl = new AbortController();
    api<{ availability: string[] }>(`/api/groups/${id}/me`, "GET", undefined, ctl.signal)
      .then((me) => { if (!me.availability?.length) router.replace(`/groups/${id}/setup`); })
      .catch(() => {});
    return () => ctl.abort();
  }, [id, router]);
}
