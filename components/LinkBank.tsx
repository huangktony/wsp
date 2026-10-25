"use client";
import { useState } from "react";
import { api } from "@/lib/client";
import { PROFILES, PROFILE_LABELS } from "@/lib/profiles";

/** Picks a demo spender profile and links the bank account right away. Used on Spending and Setup. */
export function LinkBank({ onLinked }: { onLinked: (tier: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null), [err, setErr] = useState("");

  async function link(profile: string) {
    setBusy(profile);
    setErr("");
    try {
      const d = await api("/api/bank/link", "POST", { profile });
      onLinked(d.tier);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="space-y-3 rounded-card border-2 border-sage bg-mintsoft p-4">
      <div className="flex items-center gap-3">
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sage text-xl text-sageink">$</span>
        <span>
          <span className="block font-bold">Link your bank</span>
          <span className="block text-sm text-muted">Pick a demo account to get started</span>
        </span>
      </div>
      {PROFILES.map((p) => (
        <button key={p} type="button" className="btn" disabled={!!busy} onClick={() => link(p)}>{busy === p ? "Linking…" : PROFILE_LABELS[p]}</button>
      ))}
      {err && <p className="text-sm font-semibold text-deep">{err}</p>}
    </div>
  );
}
