"use client";
import { useState } from "react";
import { Page } from "@/components/Page";
import { CategoryBars } from "@/components/CategoryBars";
import { TierGauge } from "@/components/TierGauge";
import { TierBadge } from "@/components/TierBadge";
import { LinkBank } from "@/components/LinkBank";
import { useApi } from "@/lib/client";

const money = (n: number) => Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });

export default function Spending() {
  const [days, setDays] = useState(30);
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
        <LinkBank onLinked={() => reload()} />
      </Page>
    );
  }
  const n = data.days ?? days;
  return (
    <Page title="Spending and budget" tabs>
      <div className="mb-3 flex gap-2">
        {[7, 14, 30].map((d) => <button key={d} onClick={() => setDays(d)} className={`rounded-full border px-4 py-1 text-sm font-semibold ${days === d ? "border-sage bg-sage text-sageink" : "border-line"}`}>{d}d</button>)}
      </div>
      <div className="card mb-4 text-center">
        <p className="text-sm font-semibold text-muted">Spent in the last {n} days</p>
        <p className="font-display text-4xl font-bold">${money(data.spent)}</p>
        <p className="mt-1 text-sm text-muted">{data.count} {data.count === 1 ? "purchase" : "purchases"}</p>
        {data.paidBackToYou > 0 && <p className="mt-2"><span className="rounded-full bg-mint px-3 py-1 text-sm font-bold text-matchaink">+${money(data.paidBackToYou)} paid back to you</span></p>}
        {data.startingBalance != null && <p className="mt-1 text-sm text-muted">Starting balance ${data.startingBalance.toLocaleString()}</p>}
      </div>
      <div className="card mb-4">
        <div className="mb-3 flex items-center justify-between"><h2 className="font-bold">Your budget level</h2><TierBadge tier={data.tier} /></div>
        <TierGauge tier={data.tier} avg={data.avgOuting} cutoffs={data.cutoffs} usedDefault={data.usedDefault} />
        <p className="mt-1 text-xs text-muted">Always based on the last 30 days of food and entertainment.</p>
      </div>
      <div className="card mb-4"><h2 className="mb-3 font-bold">By category</h2>{data.categories.length ? <CategoryBars data={data.categories} /> : <p className="text-sm text-muted">No purchases in this range.</p>}</div>
      <div className="card"><h2 className="mb-2 font-bold">Transactions</h2>
        {data.transactions.length ? (
          <ul className="space-y-2 text-sm">
            {data.transactions.map((t: any, i: number) => (
              <li key={i} className="flex items-center justify-between gap-3">
                <span>{t.label}</span>
                {t.amount > 0
                  ? <span className="rounded-full bg-mint px-2.5 py-0.5 font-bold text-matchaink">+${money(t.amount)}</span>
                  : <span>-${money(t.amount)}</span>}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">No transactions in this range.</p>}
        <p className="mt-3 text-xs text-muted">Recorded in your Capital One Nessie demo account. Demo only, no real money moves.</p>
      </div>
      <p className="mt-3 text-center text-xs text-muted">Only you can see this. Friends see the group's lowest tier, nothing else.</p>
    </Page>
  );
}
