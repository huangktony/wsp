"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Page } from "@/components/Page";
import { TierBadge } from "@/components/TierBadge";
import { Skeleton, SkeletonBlock } from "@/components/Skeleton";
import { api, INTERESTS, toggle, useApi } from "@/lib/client";

export default function Profile() {
  const r = useRouter();
  const { data, error } = useApi<any>("/api/me");
  const [it, setIt] = useState<string[]>([]), [mi, setMi] = useState(10), [saved, setSaved] = useState(false);
  useEffect(() => { if (data) { setIt(data.interests); setMi(data.max_distance_mi); } }, [data]);
  if (!data) return (
    <Page tabs>
      {error ? <p role="alert" className="text-sm font-semibold text-deep">{error}</p> : (
        <Skeleton>
          <SkeletonBlock className="mb-4 h-9 w-1/2" />
          <div className="space-y-6">
            <SkeletonBlock className="h-[58px]" />
            <div><SkeletonBlock className="mb-2 h-5 w-24" /><div className="flex gap-2"><SkeletonBlock className="h-10 w-20 !rounded-full" /><SkeletonBlock className="h-10 w-24 !rounded-full" /><SkeletonBlock className="h-10 w-28 !rounded-full" /></div></div>
            <div><SkeletonBlock className="mb-2 h-5 w-36" /><SkeletonBlock className="h-4" /></div>
            <SkeletonBlock className="h-14" /><SkeletonBlock className="h-14" /><SkeletonBlock className="h-14" />
          </div>
        </Skeleton>
      )}
    </Page>
  );
  return (
    <Page title={data.name} tabs>
      <div className="space-y-6">
        <div className="card flex items-center justify-between"><span>Comfort level</span><TierBadge tier={data.budget_tier} /></div>
        <section><span className="label">Interests</span><div className="flex flex-wrap gap-2">
          {INTERESTS.map((s) => <button key={s} onClick={() => setIt(toggle(it, s))} className={`rounded-full border px-4 py-2 text-sm font-semibold capitalize ${it.includes(s) ? "border-sage bg-sage text-sageink" : "border-line"}`}>{s}</button>)}
        </div></section>
        <section><span className="label">Max distance: {mi} mi</span><input type="range" min={1} max={30} value={mi} onChange={(e) => setMi(+e.target.value)} className="w-full accent-[var(--sage)]" /></section>
        <button className="btn" onClick={() => api("/api/me", "PUT", { interests: it, max_distance_mi: mi }).then(() => setSaved(true))}>{saved ? "Saved ✓" : "Save"}</button>
        <Link href="/settings" className="btn-ghost">Settings</Link>
        <button className="btn-ghost" onClick={() => api("/api/auth/logout", "POST").then(() => { r.push("/login"); r.refresh(); })}>Log out</button>
      </div>
    </Page>
  );
}
