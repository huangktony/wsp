"use client";
import { useState } from "react";
import { api } from "@/lib/client";

const OPTIONS = [
  { profile: "frugal", label: "Frugal" },
  { profile: "average", label: "Average" },
  { profile: "big", label: "Big spender" },
] as const;

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
      {OPTIONS.map((o) => (
        <button key={o.profile} type="button" className="btn-ghost" disabled={busy} onClick={() => link(o.profile)}>{busy ? "Linking…" : o.label}</button>
      ))}
      {err && <p className="text-sm font-semibold text-deep">{err}</p>}
    </div>
  );
}
