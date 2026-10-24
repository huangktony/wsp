"use client";
import { use } from "react";
import { Page } from "@/components/Page";
import { api, useApi } from "@/lib/client";

export default function Final({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, reload } = useApi<any>(`/api/groups/${id}/plans`, 3000);
  const plan = data?.plans.find((p: any) => p.id === data.round.winner_plan_id);
  if (!plan) return <Page back={`/groups/${id}`}>Loading…</Page>;
  const mine = data.payments.find((p: any) => p.user_id === data.me);
  return (
    <Page title="It's a plan!" back={`/groups/${id}`}>
      <article className="card mb-4 bg-mintsoft">
        <h2 className="text-2xl font-bold">{plan.title}</h2>
        <p className="text-sm text-muted">{plan.summary}</p>
        <ol className="mt-3 space-y-1 text-sm">{plan.stops.map((s: any, i: number) => <li key={i}><b>{s.time}</b> · {s.place}</li>)}</ol>
      </article>
      <div className="card mb-4 text-center"><p className="text-sm text-muted">Your share (even split)</p><p className="font-display text-4xl font-bold">${plan.cost}</p></div>
      <ul className="mb-4 space-y-2">{data.payments.map((p: any) => <li key={p.id} className="flex justify-between"><span>{p.name}</span><span className={p.status === "paid" ? "chip" : "chip-pink"}>{p.status.toUpperCase()}</span></li>)}</ul>
      {mine?.status === "owed" && <button className="btn" onClick={() => api(`/api/payments/${mine.id}/mark-paid`, "POST").then(reload)}>Mark my share paid</button>}
      <p className="mt-3 text-center text-xs text-muted">Demo only. No real money moves.</p>
    </Page>
  );
}
