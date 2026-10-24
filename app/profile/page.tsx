"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Page } from "@/components/Page";
import { TierBadge } from "@/components/TierBadge";
import { api, INTERESTS, toggle, useApi } from "@/lib/client";

export default function Profile() {
  const r = useRouter();
  const { data } = useApi<any>("/api/me");
  const [it, setIt] = useState<string[]>([]), [mi, setMi] = useState(10), [saved, setSaved] = useState(false);
  useEffect(() => { if (data) { setIt(data.interests); setMi(data.max_distance_mi); } }, [data]);
  if (!data) return <Page title="Profile" tabs>Loading…</Page>;
  return (
    <Page title={data.name} tabs>
      <div className="space-y-6">
        <div className="card flex items-center justify-between"><span>Comfort level</span><TierBadge tier={data.budget_tier} /></div>
        <section><span className="label">Interests</span><div className="flex flex-wrap gap-2">
          {INTERESTS.map((s) => <button key={s} onClick={() => setIt(toggle(it, s))} className={`rounded-full border px-4 py-2 text-sm font-semibold capitalize ${it.includes(s) ? "border-sage bg-sage text-sageink" : "border-line"}`}>{s}</button>)}
        </div></section>
        <section><span className="label">Max distance: {mi} mi</span><input type="range" min={1} max={30} value={mi} onChange={(e) => setMi(+e.target.value)} className="w-full accent-[var(--sage)]" /></section>
        <button className="btn" onClick={() => api("/api/me", "PUT", { interests: it, max_distance_mi: mi }).then(() => setSaved(true))}>{saved ? "Saved ✓" : "Save"}</button>
        <button className="btn-ghost" onClick={() => api("/api/auth/logout", "POST").then(() => { r.push("/login"); r.refresh(); })}>Log out</button>
      </div>
    </Page>
  );
}
