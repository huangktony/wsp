'use client';
import Link from 'next/link';
import { Page } from './Page';
import { Inter } from 'next/font/google';
import { Skeleton, SkeletonBlock } from './Skeleton';
const inter = Inter({ subsets: ['latin'], weight: ['400', '600', '700', '800'] });
import { type DiscoveryDates, type DiscoverySummary } from '@/lib/travel/discovery';
import { US_AIRPORTS, SCOPES, airportName, type TripScope, cheapest, recheckLink, type Option, type Vote } from '@/lib/travel/core';
import { formatDuration, formatFareTime, formatTripDates } from '@/lib/travel/format';
export const travelFocus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo';
export const travelButton = `inline-flex min-h-12 items-center justify-center rounded-full bg-panel px-5 py-3 text-base font-bold text-white disabled:opacity-50 ${travelFocus}`;
export const travelQuiet = `inline-flex min-h-12 items-center justify-center rounded-full border border-outline px-4 py-3 text-sm font-bold text-indigo disabled:opacity-50 ${travelFocus}`;
export const travelInput = `min-h-11 w-full min-w-0 rounded-xl border border-outline bg-surface px-3 py-2 text-base text-indigo ${travelFocus}`;
export function TravelFrame({ title, eyebrow = 'WSP TRAVEL', children, demo = false, back }: { title: string; eyebrow?: string; children: React.ReactNode; demo?: boolean; back?: string }) {
  return <div className={inter.className}><Page back={back}><div className="text-indigo">
    <header className="mb-5"><p className="mb-2 text-xs font-extrabold tracking-[0.18em] text-secondary">{eyebrow}</p><h1 className="break-words font-[inherit] text-[28px] font-extrabold leading-[1.1] tracking-[-0.5px]">{title}</h1></header>
    <div className="space-y-5">{children}</div>
  </div></Page></div>;
}
export function TravelSkeleton() {
  return <Skeleton><SkeletonBlock className="mb-4 h-7 w-2/3"/><SkeletonBlock className="mb-4 h-24"/><SkeletonBlock className="mb-4 h-48"/><SkeletonBlock className="h-12"/></Skeleton>;
}
export function FareWarning({ expired }: { expired?: boolean }) {
  if (!expired) return null;
  return <p role="status" className="rounded-2xl bg-pistachio p-4 text-xs leading-relaxed text-secondary">Fares expired. Recheck before booking.</p>;
}
export function TravelArt() {
  return <svg viewBox="0 0 320 115" role="img" aria-label="Three friends, one shared destination" className="w-full rounded-3xl bg-pistachio text-indigo">
    <path d="M35 25Q145 0 244 58M35 58H244M35 91Q145 115 244 58" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 5" fill="none" opacity=".5" />
    {[25,58,91].map((y,i) => <g key={y}><circle cx="35" cy={y} r="12" fill={['var(--orchid)','var(--peach)','var(--matcha)'][i]} /><text x="35" y={y+4} textAnchor="middle" fontSize="11" fontWeight="800" fill="currentColor">{['S','T','R'][i]}</text></g>)}
    <circle cx="255" cy="58" r="29" fill="var(--indigo)"/><path d="m240 60 28-13-11 28-5-12-12-3 28-13-16 16" stroke="var(--surface)" strokeWidth="2" fill="none" strokeLinejoin="round" />
  </svg>;
}
export function AirportSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return <label className="block min-w-0 text-sm font-semibold">{label}<select required value={value} onChange={e => onChange(e.target.value)} className={`${travelInput} mt-1`}>
    <option value="">Choose a US airport</option>{US_AIRPORTS.map(([code,city]) => <option key={code} value={code}>{code} · {city}</option>)}
  </select></label>;
}
export function DatesEditor({ value, onChange, tall = false }: { value: DiscoveryDates; onChange: (v: DiscoveryDates) => void; tall?: boolean }) {
  // `tall` matches the 54px inputs on the Start a trip page.
  const field = `${travelInput} mt-1 ${tall ? '!h-[54px] !rounded-2xl !border-2 !px-3 !text-base' : '!px-1 !text-sm'}`;
  return <fieldset className="min-w-0 space-y-3"><legend className="mb-2 font-bold">When can everyone travel?</legend>
    <div className="grid min-w-0 grid-cols-2 gap-2"><label className="min-w-0 text-xs font-semibold">Depart<input required type="date" aria-label="Shared departure date" value={value.depart} onChange={e=>onChange({...value,depart:e.target.value})} className={field}/></label>
    <label className="min-w-0 text-xs font-semibold">Return<input required type="date" aria-label="Shared return date" value={value.return} onChange={e=>onChange({...value,return:e.target.value})} className={field}/></label></div>
  </fieldset>;
}
/** Three chips: where the search looks for meeting places. */
export function ScopePicker({ value, onChange, tall = false }: { value: TripScope; onChange: (v: TripScope) => void; tall?: boolean }) {
  return <fieldset className="min-w-0"><legend className="mb-2 font-bold">Where should we look?</legend>
    <div role="radiogroup" aria-label="Trip scope" className="grid grid-cols-3 gap-2">
      {SCOPES.map(({ value: scope, label }) => <button key={scope} type="button" role="radio" aria-checked={value === scope} onClick={() => onChange(scope)}
        className={`rounded-2xl border-2 px-2 text-sm font-bold ${tall ? 'h-[54px]' : 'min-h-11'} ${travelFocus} ${value === scope ? 'border-panel bg-panel text-white' : 'border-outline bg-surface text-indigo'}`}>{label}</button>)}
    </div></fieldset>;
}
export function DiscoverySummaryNote({ summary, demo = false, options }: { summary?: DiscoverySummary | null; demo?: boolean; options?: Option[] }) {
  if (!summary) return null;
  const closest = summary.qualifiedCount === 0 && summary.returnedCount > 0;
  const text = closest ? 'Nothing fits everyone’s budget. Closest options:' : summary.returnedCount === 0 ? 'No destination fits everyone’s budget yet.' : `${summary.qualifiedCount} of ${summary.searchedCount} destinations fit everyone’s budget.`;
  const allOver = !!options?.length && options.every(o => o.fits === false);
  return <p role="status" className="rounded-2xl bg-pistachio p-4 text-sm text-secondary">{demo ? 'Sample: ' : ''}{text}{allOver && <span className="mt-1 block">Anyone can veto. Try a smaller scope or a higher limit.</span>}</p>;
}
export function TravelNotice() {
  return <p className="rounded-2xl border border-dashed border-outline p-4 text-xs leading-relaxed text-secondary">Fare estimates only. Budget checks use the Nessie sandbox. We never book or move money.</p>;
}
const money = (n: number) => new Intl.NumberFormat('en-US',{ style:'currency',currency:'USD',maximumFractionDigits:2 }).format(n);
export function ComparisonCards({ options, myVotes, onVote, voting, busy = false, winnerId, demo = false, showRecommendation = true }: { options: Option[]; myVotes: { optionId:number; value:Vote }[]; onVote?: (id:number,value:Vote) => void; voting: boolean; busy?: boolean; winnerId?: number | null; demo?: boolean; showRecommendation?: boolean }) {
  // Over-budget closest options get no 'lowest' badge: their one chip says why they are shown.
  const best = showRecommendation ? cheapest(options.filter(o => o.fits !== false)) : null;
  return <div className="space-y-4">{options.map(o => <article key={o.id} className={`card overflow-hidden !p-0 ${winnerId === o.id ? 'border-2 border-sage' : ''}`}>
    <header className={`p-4 ${winnerId === o.id || best === o.id ? 'bg-pistachio' : 'bg-orchid/20'}`}>
      <div className="mb-2 flex flex-wrap gap-2">{showRecommendation && o.recommendation && <span className="rounded-full bg-orchid px-3 py-1 text-xs font-bold text-orchidink">{o.recommendation.label}</span>}{o.fits === false && <span className="rounded-full bg-peach px-3 py-1 text-xs font-bold text-indigo">Over someone’s budget</span>}{winnerId === o.id && <span className="rounded-full bg-panel px-3 py-1 text-xs font-bold text-white">Your meeting place</span>}{best === o.id && o.recommendation?.kind !== 'lowest-cost' && <span className="rounded-full bg-matcha px-3 py-1 text-xs font-bold text-matchaink">Lowest total found</span>}</div>
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-[inherit] text-xl font-extrabold">{airportName(o.airport)} <span className="text-sm font-normal text-secondary">{o.airport}</span></h2><p className="text-xl font-extrabold">{o.total === null ? 'Unavailable' : money(o.total)}</p></div>
      <p className="mt-1 text-xs text-secondary">{formatTripDates(o.depart, o.return)} · {o.complete ? 'group total' : 'Some routes are missing'}</p>
    </header>
    <ul className="divide-y divide-azure px-4">{o.routes.map(r => <li key={r.userId} className="py-3">
      <div className="flex items-start justify-between gap-2"><div><p className="font-bold">{r.name} <span className="text-xs font-normal text-secondary">{r.origin} → {r.destination}</span></p><p className="mt-0.5 text-xs text-secondary">{r.local ? 'Local · no flight needed' : r.price === null ? 'No fare available' : `${r.airlines.join(', ') || 'Airline details unavailable'}${r.stops === null ? '' : ` · ${r.stops} stop${r.stops === 1 ? '' : 's'}`}${formatDuration(r.duration) ? ` · ${formatDuration(r.duration)}` : ''}`}</p></div><span className="shrink-0 font-bold">{r.price === null ? '—' : money(r.price)}</span></div>
      {o.fits === false ? null : (() => {
        // Only a check run against a real sandbox account counts as passed. A simulated account is never shown as verified.
        const ok = demo ? r.check === true : r.check === true && r.checkSource !== 'simulated';
        return <p className="mt-2 text-xs" aria-label={ok ? `${demo ? 'Simulated' : 'Nessie sandbox'} private flight budget check passed` : 'Private flight budget check needs attention or is unavailable'}>{ok ? '✅' : '⚠️'} {demo ? 'Simulated check' : ok ? 'Within budget' : 'Budget check unavailable'}</p>;
      })()}
      {r.error && <p className="mt-1 text-xs text-maroon">{r.error}</p>}
      {!demo && !r.local && <a href={recheckLink(r)} target="_blank" rel="noreferrer" className={`mt-1 inline-flex min-h-11 items-center text-xs font-bold underline ${travelFocus}`}>Recheck fares ↗</a>}
    </li>)}</ul>
    <div className="px-4 pb-4"><p className="mb-3 text-xs text-secondary">{demo ? 'Sample fares' : formatFareTime(o.routes[0]?.quotedAt) ? `Fares as of ${formatFareTime(o.routes[0]?.quotedAt)}` : 'Fares as of comparison time'}</p>
      {voting && o.complete && <div className="grid grid-cols-2 gap-2">{(['approve','veto'] as const).map(v => <button key={v} disabled={busy} aria-pressed={myVotes.some(b => b.optionId === o.id && b.value === v)} onClick={() => onVote?.(o.id,v)} className={`${travelQuiet} ${myVotes.some(b => b.optionId === o.id && b.value === v) ? v === 'approve' ? '!bg-matcha !border-matcha' : '!bg-orchid !border-orchid' : ''}`}>{v === 'approve' ? '✓ Approve' : '✕ Veto'}</button>)}</div>}
    </div>
  </article>)}</div>;
}
