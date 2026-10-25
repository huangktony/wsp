"use client";
import { useState } from "react";
import { api } from "@/lib/client";
import { PROFILES, PROFILE_LABELS } from "@/lib/profiles";

/** Picks a demo spender profile and links the bank account right away. Used on Spending and Setup. */
export function LinkBank({ onLinked }: { onLinked: (tier: string) => void }) {
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");

  async function link(profile: string) {
    setBusy(true);
    setErr("");
    try {
      const d = await api("/api/bank/link", "POST", { profile });
      onLinked(d.tier);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-muted">Pick a demo account</p>
      {PROFILES.map((p) => (
        <button key={p} type="button" className="btn-ghost" disabled={busy} onClick={() => link(p)}>{busy ? "Linking…" : PROFILE_LABELS[p]}</button>
      ))}
      {err && <p className="text-sm font-semibold text-deep">{err}</p>}
    </div>
  );
}
