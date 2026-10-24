"use client";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { Page, Err } from "@/components/Page";
import { TierBadge } from "@/components/TierBadge";
import { api, useApi } from "@/lib/client";

export default function Plans({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const r = useRouter();
  const { data, reload } = useApi<any>(`/api/groups/${id}/plans`, 3000);
  const [err, setErr] = useState("");
  if (!data?.round) return <Page back={`/groups/${id}`}>No plans yet.</Page>;
  const vote = (planId: number, value: string) => api(`/api/plans/${planId}/vote`, "POST", { value }).then(reload).catch((e) => setErr(e.message));
  const lock = () => api(`/api/groups/${id}/final`, "POST").then(() => r.push(`/groups/${id}/final`)).catch((e) => setErr(e.message));
  if (data.round.status === "final") r.replace(`/groups/${id}/final`);
  return (
    <Page title="Pick a plan" back={`/groups/${id}`}>
      <div className="mb-4"><TierBadge tier={data.round.group_tier} label="Group budget" /></div>
      <div className="space-y-4">
        {data.plans.map((p: any) => (
          <article key={p.id} className="card">
            <div className="flex items-start justify-between"><h2 className="text-xl font-bold">{p.title}</h2><TierBadge tier={p.price_level} /></div>
            <p className="mt-1 text-sm text-muted">{p.summary}</p>
            <ol className="my-3 space-y-1 text-sm">{p.stops.map((s: any, i: number) => <li key={i}><b>{s.time}</b> · {s.place}</li>)}</ol>
            <p className="text-sm text-muted">~${p.cost} per person. {p.why_fits}</p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => vote(p.id, "approve")} className={`flex-1 rounded-2xl py-3 font-semibold ${p.my_vote === "approve" ? "bg-sage text-sageink" : "border border-line"}`}>Approve</button>
              <button onClick={() => vote(p.id, "pass")} className={`flex-1 rounded-2xl py-3 font-semibold ${p.my_vote === "pass" ? "bg-pink" : "border border-line"}`}>Pass</button>
            </div>
            <p className="mt-2 text-center text-xs font-semibold text-muted">{p.approve} approve · {p.pass} pass · {data.memberCount} members</p>
          </article>
        ))}
      </div>
      <Err msg={err} />
      {data.isCreator && data.round.status === "voting" && <button className="btn mt-5" onClick={lock}>Lock in plan</button>}
    </Page>
  );
}
