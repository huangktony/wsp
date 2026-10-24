"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Page, Err } from "@/components/Page";
import { TierBadge } from "@/components/TierBadge";
import { api, INTERESTS, SLOTS, toggle, useApi } from "@/lib/client";


export default function Setup({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const r = useRouter();
  const { data } = useApi<any>(`/api/groups/${id}/me`);
  const [linkedTier, setLinkedTier] = useState<string | null>(null);
  const [av, setAv] = useState<string[]>([]), [it, setIt] = useState<string[]>([]), [mi, setMi] = useState(10), [err, setErr] = useState("");
  useEffect(() => { if (data) { setAv(data.availability); setIt(data.interests); setMi(data.max_distance_mi); } }, [data]);
  const Chip = ({ v, on, click }: { v: string; on: boolean; click: () => void }) => (
    <button type="button" onClick={click} className={`rounded-full border px-4 py-2 text-sm font-semibold capitalize ${on ? "border-sage bg-sage text-sageink" : "border-line"}`}>{v}</button>
  );
  return (
    <Page title="My setup" back={`/groups/${id}`}>
      <div className="space-y-6">
        <section><span className="label">When are you free?</span><div className="flex flex-wrap gap-2">{SLOTS.map((s) => <Chip key={s} v={s} on={av.includes(s)} click={() => setAv(toggle(av, s))} />)}</div></section>
        <section><span className="label">Interests</span><div className="flex flex-wrap gap-2">{INTERESTS.map((s) => <Chip key={s} v={s} on={it.includes(s)} click={() => setIt(toggle(it, s))} />)}</div></section>
        <section><span className="label">Max distance: {mi} mi</span><input type="range" min={1} max={30} value={mi} onChange={(e) => setMi(+e.target.value)} className="w-full accent-[var(--sage)]" /></section>
        <section className="card flex items-center justify-between"><span className="text-sm text-muted">Your comfort level (only you see this)</span><TierBadge tier={data?.budget_tier ?? linkedTier} /></section>
        {data && !data.budget_tier && !linkedTier && (
          <button type="button" className="btn-ghost" onClick={() => api("/api/bank/link", "POST").then((d) => setLinkedTier(d.tier)).catch((e) => setErr(e.message))}>Link demo bank account</button>
        )}
        {data && !av.length && <p className="text-sm text-muted">Pick at least one time you're free.</p>}
        <Err msg={err} />
        <button className="btn" disabled={!data || !av.length} onClick={() => api(`/api/groups/${id}/me`, "PUT", { availability: av, interests: it, max_distance_mi: mi }).then(() => r.push(`/groups/${id}`)).catch((e) => setErr(e.message))}>Save</button>
      </div>
    </Page>
  );
}
