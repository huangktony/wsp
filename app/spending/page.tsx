"use client";
import Link from "next/link";
import { useState } from "react";
import { Inter } from "next/font/google";
import { Page } from "@/components/Page";
import { BalanceDebtChart } from "@/components/BalanceDebtChart";
import { LinkBank } from "@/components/LinkBank";
import { Skeleton, SkeletonBlock } from "@/components/Skeleton";
import { TierGauge } from "@/components/TierGauge";
import { categoryStyle } from "@/components/categoryStyle";
import { useApi } from "@/lib/client";
import { formatMoney, formatSigned, relativeDay } from "@/lib/format";

const inter = Inter({ subsets: ["latin"], weight: ["400", "600", "700", "800"] });
const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo";

function Header() {
  return (
    <header className="flex items-center gap-3 pb-5">
      <Link href="/groups" aria-label="Back to groups" className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-pistachio ${focus}`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
      </Link>
      <h1 className="min-w-0 flex-1 font-[inherit] text-[28px] font-extrabold leading-tight tracking-[-1px]">Your money</h1>
      <span className="rounded-full bg-orchid px-3 py-1 text-xs font-extrabold tracking-wide text-orchidink">DEMO</span>
    </header>
  );
}

const Shell = ({ children }: { children: React.ReactNode }) => (
  <Page variant="plain" tabs>
    <div className={`${inter.className} bg-surface px-6 pt-6 text-indigo`}>{children}</div>
  </Page>
);

export default function Spending() {
  const { data, error, reload } = useApi<any>("/api/me/spending");
  const [open, setOpen] = useState(false);

  if (error) {
    return (
      <Shell>
        <Header />
        <p role="alert" className="mb-4 text-sm font-semibold text-maroon">{error}</p>
        <button type="button" onClick={reload} className={`flex h-14 w-full items-center justify-center rounded-2xl bg-matcha text-[17px] font-extrabold text-matchaink ${focus}`}>Retry</button>
      </Shell>
    );
  }
  if (!data) return (
    <Shell>
      <Header />
      <Skeleton>
        <SkeletonBlock className="h-[285px] !rounded-3xl" />
        <div className="mt-3 grid grid-cols-2 gap-3"><SkeletonBlock className="h-[95px] !rounded-3xl" /><SkeletonBlock className="h-[95px] !rounded-3xl" /></div>
        <div className="mt-7"><SkeletonBlock className="h-7 w-2/3" /><SkeletonBlock className="mt-3 h-3.5 !rounded-full" /><SkeletonBlock className="mt-4 h-20" /></div>
        <div className="mt-7"><SkeletonBlock className="h-7 w-24" /><div className="mt-1 space-y-2">{Array.from({ length: 10 }, (_, i) => <SkeletonBlock key={i} className="h-[62px]" />)}</div></div>
        <SkeletonBlock className="mt-7 h-[84px] !rounded-3xl" />
        <SkeletonBlock className="mt-6 h-[88px]" />
      </Skeleton>
    </Shell>
  );
  if (!data.linked) {
    return (
      <Shell>
        <Header />
        <p className="mb-4 text-secondary">Link a demo account to see your spending and budget level.</p>
        <LinkBank onLinked={() => reload()} />
      </Shell>
    );
  }

  const hasBalance = data.balance != null;
  const total = data.categories.reduce((a: number, c: any) => a + c.total, 0) || 1;
  const move = data.change as number;

  return (
    <Shell>
      <Header />

      <section aria-label="Net position" className="rounded-3xl bg-panel p-5 text-white">
        {hasBalance ? (
          <>
            <p className="text-sm font-semibold text-panelsoft">Net position</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-[44px] font-extrabold leading-none tracking-[-1.5px]">{data.net < 0 ? "-" : ""}{formatMoney(data.net)}</p>
              <p className={`text-sm font-bold ${move < 0 ? "text-pink" : "text-panelsoft"}`}>
                {move === 0 ? "no change this month" : `${move < 0 ? "down" : "up"} ${formatMoney(move)} this month`}
              </p>
            </div>
            <BalanceDebtChart balance={data.series} />
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-panelsoft">Spent in the last 30 days</p>
            <p className="mt-1 text-[44px] font-extrabold leading-none tracking-[-1.5px]">{formatMoney(data.spent)}</p>
          </>
        )}
      </section>

      {hasBalance && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-3xl bg-pistachio p-4 text-matchaink">
            <p className="flex items-center gap-2 text-sm font-bold"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-matchaink" />Balance</p>
            <p className="mt-1 text-[26px] font-extrabold tracking-[-0.5px]">{formatMoney(data.balance)}</p>
          </div>
          <div className="rounded-3xl bg-orchid p-4 text-orchidink">
            <p className="flex items-center gap-2 text-sm font-bold"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-orchidink" />You owe</p>
            <p className="mt-1 text-[26px] font-extrabold tracking-[-0.5px]">{formatMoney(data.owe)}</p>
          </div>
        </div>
      )}

      <section aria-label="Where it went" className="mt-7">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-[inherit] text-xl font-extrabold tracking-[-0.5px]">Where it went</h2>
          <p className="text-sm font-semibold text-secondary">{formatMoney(data.spent)} in 30 days</p>
        </div>
        {data.categories.length ? (
          <>
            <div className="mt-3 flex h-3.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={data.categories.map((c: any) => `${categoryStyle(c.name).label} ${formatMoney(c.total)}`).join(", ")}>
              {data.categories.map((c: any) => <div key={c.name} className={categoryStyle(c.name).bg} style={{ width: `${(c.total / total) * 100}%` }} />)}
            </div>
            <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
              {data.categories.map((c: any) => (
                <li key={c.name} className="flex items-center gap-2">
                  <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${categoryStyle(c.name).bg}`} />
                  <span className="min-w-0 flex-1 truncate">{categoryStyle(c.name).label}</span>
                  <span className="font-bold">{formatMoney(c.total)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : <p className="mt-3 text-sm text-secondary">No spending in the last 30 days.</p>}
      </section>

      <section aria-label="Recent" className="mt-7">
        <h2 className="font-[inherit] text-xl font-extrabold tracking-[-0.5px]">Recent</h2>
        {data.transactions.length ? (
          <ul className="mt-1 divide-y divide-azure">
            {data.transactions.map((t: any, i: number) => (
              <li key={i} className="flex items-center gap-3 py-3">
                <span aria-hidden="true" className={`h-10 w-10 shrink-0 rounded-full ${categoryStyle(t.category).bg}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{t.label}</span>
                  <span className="block text-sm text-secondary">{relativeDay(t.date, data.today)} · {categoryStyle(t.category).label}</span>
                </span>
                {t.amount > 0
                  ? <span className="shrink-0 rounded-full bg-pistachio px-2.5 py-0.5 font-bold text-matchaink">{formatSigned(t.amount)}</span>
                  : <span className="shrink-0 font-bold">{formatSigned(t.amount)}</span>}
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-sm text-secondary">Nothing yet.</p>}
      </section>

      <section aria-label="Comfort level" className="mt-7">
        <button type="button" aria-expanded={open} aria-controls="comfort-gauge" onClick={() => setOpen(!open)} className={`flex w-full items-center gap-4 rounded-3xl border-2 border-outline p-4 text-left ${focus}`}>
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo text-lg font-extrabold text-surface">{data.tier ?? "–"}</span>
          <span className="min-w-0 flex-1">
            <span className="block font-extrabold">Comfort level</span>
            <span className="block text-sm text-secondary">{data.usedDefault ? "Not enough fun purchases yet" : `About ${formatMoney(data.avgOuting)} per outing`}</span>
          </span>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`}><path d="M9 5l7 7-7 7" /></svg>
        </button>
        {open && (
          <div id="comfort-gauge" className="mt-3 rounded-3xl border border-azure p-4">
            <TierGauge tier={data.tier} avg={data.avgOuting} cutoffs={data.cutoffs} usedDefault={data.usedDefault} />
            <p className="mt-2 text-xs text-secondary">Always based on the last 30 days of food and entertainment.</p>
          </div>
        )}
      </section>

      <p className="mt-6 pb-2 text-center text-xs text-secondary">
        Your balance starts from your Nessie demo balance and moves with your purchases and paybacks, since Nessie never changes it. Recorded in your Capital One Nessie demo account. Demo only, no real money moves. Only you can see this.
      </p>
    </Shell>
  );
}
