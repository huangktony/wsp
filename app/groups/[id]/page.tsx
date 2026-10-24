"use client";
import Link from "next/link";
import { use } from "react";
import { Page } from "@/components/Page";
import { TierBadge } from "@/components/TierBadge";
import { useApi } from "@/lib/client";

export default function GroupHome({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: g, error } = useApi<any>(`/api/groups/${id}`);
  if (!g) return <Page back="/groups">{error || "Loading…"}</Page>;
  const allSet = g.members.every((m: any) => m.setup_done);
  const open = g.round?.status === "voting", final = g.round?.status === "final";
  return (
    <Page title={g.name} back="/groups">
      <div className="mb-4 flex items-center gap-2"><span className="text-muted">{g.city}</span><TierBadge tier={g.groupTier} label="Group budget" /></div>
      <div className="card mb-4">
        <h2 className="mb-2 font-bold">Members</h2>
        <ul className="space-y-2">
          {g.members.map((m: any) => (
            <li key={m.id} className="flex justify-between"><span>{m.name}{m.id === g.me && " (you)"}</span><span className={m.setup_done ? "chip" : "chip-pink"}>{m.setup_done ? "READY" : "SET UP"}</span></li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted">Invite code: <b className="text-ink">{g.invite_code}</b></p>
      </div>
      <div className="space-y-3">
        <Link href={`/groups/${id}/setup`} className="btn-ghost">My setup</Link>
        {open && <Link href={`/groups/${id}/plans`} className="btn">Vote on plans</Link>}
        {final && <Link href={`/groups/${id}/final`} className="btn">See final plan</Link>}
        {!open && <Link href={`/groups/${id}/finding`} className="btn">{final ? "Find new plans" : "Find plans"}</Link>}
        {!allSet && <p className="text-center text-sm text-muted">Some members haven't set availability yet. Plans still work with who is ready.</p>}
      </div>
    </Page>
  );
}
