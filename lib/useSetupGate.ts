"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "./client";

/** Sends a member who hasn't finished setup for this group to the setup screen. Setup can't be skipped. */
export function useSetupGate(id: string, allowLoadingPreview = false) {
  const router = useRouter();
  useEffect(() => {
    // The finding demo stays local; normal screens and production still require setup.
    const previewAllowed = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_PREVIEW === "true";
    if (allowLoadingPreview && previewAllowed && new URLSearchParams(window.location.search).get("preview") === "loading") return;
    const ctl = new AbortController();
    api<{ availability: string[] }>(`/api/groups/${id}/me`, "GET", undefined, ctl.signal)
      .then((me) => { if (!me.availability?.length) router.replace(`/groups/${id}/setup`); })
      .catch(() => {});
    return () => ctl.abort();
  }, [id, router, allowLoadingPreview]);
}
