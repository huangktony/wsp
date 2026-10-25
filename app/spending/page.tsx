"use client";
import { useState } from "react";
import { Page } from "@/components/Page";
import { BalanceDebtChart } from "@/components/BalanceDebtChart";
import { CategoryBars } from "@/components/CategoryBars";
import { TierGauge } from "@/components/TierGauge";
import { TierBadge } from "@/components/TierBadge";
import { api, useApi } from "@/lib/client";

export default function Spending() {
  const [days, setDays] = useState(30);
  const [linking, setLinking] = useState(false), [linkErr, setLinkErr] = useState("");
  const { data, error, reload } = useApi<any>(`/api/me/spending?days=${days}`);
  if (error) {
    return (
      <Page title="Spending and budget" tabs>
        <p className="mb-4 font-semibold text-deep">{error}</p>
        <button className="btn" onClick={reload}>Retry</button>
      </Page>
    );
  }
  if (!data) return <Page title="Budget" tabs>Loading…</Page>;
  if (!data.linked) {
    return (
      <Page title="Spending and budget" tabs>
        <p className="mb-4 text-muted">Link a demo account to see your spending and budget level.</p>
        {linkErr && <p className="mb-3 font-semibold text-deep">{linkErr}</p>}
        <button className="btn" disabled={linking} onClick={() => { setLinking(true); setLinkErr(""); api("/api/bank/link", "POST").then(reload).catch((e) => setLinkErr(e.message)).finally(() => setLinking(false)); }}>{linking ? "Linking…" : "Link demo bank account"}</button>
      </Page>
    );
  }
  const bal = data.balance.at(-1)?.value ?? 0, debt = data.debt.at(-1)?.value ?? 0;
  return (
    <Page title="Spending and budget" tabs>
      <div className="card mb-4 text-center">
        <p className="text-sm font-semibold text-muted">Net position</p>
        <p className="font-display text-4xl font-bold">${(bal - debt).toLocaleString()}</p>
        <div className="mt-2 flex items-center justify-center gap-2 text-sm text-muted">Your fun budget <TierBadge tier={data.tier} /> avg ${data.avgOuting ?? "–"} per outing</div>
      </div>
      <div className="card mb-4"><h2 className="mb-3 font-bold">Your budget level</h2><TierGauge tier={data.tier} avg={data.avgOuting} cutoffs={data.cutoffs} /></div>
      <div className="mb-3 flex gap-2">
        {[7, 14, 30].map((d) => <button key={d} onClick={() => setDays(d)} className={`rounded-full border px-4 py-1 text-sm font-semibold ${days === d ? "border-sage bg-sage text-sageink" : "border-line"}`}>{d}d</button>)}
      </div>
      <div className="card mb-4"><BalanceDebtChart balance={data.balance} debt={data.debt} /></div>
      <div className="card mb-4"><h2 className="mb-3 font-bold">By category</h2><CategoryBars data={data.categories} /></div>
      <div className="card"><h2 className="mb-2 font-bold">Recent</h2>
        <ul className="space-y-1 text-sm">{data.recent.map((p: any, i: number) => <li key={i} className="flex justify-between"><span>{p.merchant}</span><span>${p.amount}</span></li>)}</ul>
      </div>
      <p className="mt-3 text-center text-xs text-muted">Only you can see this. Friends see the group's lowest tier, nothing else.</p>
    </Page>
  );
}
