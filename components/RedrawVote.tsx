"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { REDRAW_MESSAGES } from "@/lib/redrawRules";

export type Redraw = { locked: false | "confirmed" | "locked"; votes: number; members: number; needed: number; mine: boolean };

/**
 * Ask the group for new plans after a plan is final. Tap to add your vote, tap again to take it back. Shows a count only, never
 * names. Once the plan is confirmed or the payment requests are sent, it is locked. The server enforces all of it; this only shows the state.
 */
export function RedrawVote({ id, redraw, onChanged }: { id: string; redraw: Redraw | null | undefined; onChanged: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  if (!redraw) return null;
  if (redraw.locked) return <p className="text-center text-[13px] leading-[1.4] text-secondary">{REDRAW_MESSAGES[redraw.locked]}</p>;

  const tap = async () => {
    setBusy(true);
    setErr("");
    try {
      const d = await api<any>(`/api/groups/${id}/redraw`, "POST");
      if (d.started) { router.push(`/groups/${id}/plans`); return; }
      onChanged();
    } catch (e: any) {
      setErr(e.message);
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <p role="status" className="text-center text-[13px] leading-[1.4] text-secondary">
        {redraw.votes} of {redraw.members} want new plans · {redraw.needed} needed
      </p>
      <button type="button" disabled={busy} aria-pressed={redraw.mine} onClick={tap}
        className="flex min-h-[48px] w-full items-center justify-center rounded-full border border-outline bg-transparent px-4 py-3 text-base font-bold text-indigo disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo">
        {busy ? "Working…" : redraw.mine ? "You asked for new plans · Undo" : "Not feeling it? Ask for new plans"}
      </button>
      {err && <p role="alert" className="text-center text-sm text-maroon">{err}</p>}
    </div>
  );
}
