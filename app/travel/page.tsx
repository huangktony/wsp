'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Inter } from 'next/font/google';
import { Page } from '@/components/Page';
import { Smiley } from '@/components/Smiley';
import { useApi } from '@/lib/client';
import { PHASE_LABEL, travelEntry, type TravelPhase } from '@/lib/travel/flow';
import { TravelSkeleton, travelFocus as focus } from '@/components/TravelUI';

const inter = Inter({ subsets: ['latin'], weight: ['400', '600', '700', '800'] });
const colors = ['bg-orchid text-orchidink', 'bg-peach text-indigo', 'bg-matcha text-matchaink', 'bg-azure text-indigo'];
type TripSummary = { id: number; name: string; members: number; ready: number; setupDone: boolean; phase: TravelPhase; myVoted: boolean; hasSavedFinal?: boolean; myConfirmed?: boolean };
const initials = (name: string) => {
  const words = name.trim().split(/\s+/);
  return (words.length > 1 ? words.slice(0, 2).map(word => word[0]).join('') : words[0].slice(0, 2)).toUpperCase();
};
const savedChoice = (trip: TripSummary) => trip.hasSavedFinal && !['voting', 'finding'].includes(trip.phase);
const href = (trip: TripSummary) => savedChoice(trip) ? `/travel/${trip.id}/final` : travelEntry(trip.id, trip.setupDone, trip.phase);
const label = (trip: TripSummary) => trip.phase === 'final' || savedChoice(trip) ? 'FINAL' : trip.phase === 'voting' ? 'VOTING OPEN' : PHASE_LABEL[trip.phase].toUpperCase();
const meta = (trip: TripSummary) => `${trip.members} ${trip.members === 1 ? 'traveler' : 'travelers'} · ${trip.ready} of ${trip.members} ready`;

export default function TravelHome() {
  const { data, error } = useApi<TripSummary[]>('/api/travel', 5000, true);
  const [query, setQuery] = useState(''), [searchOpen, setSearchOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null), triggerRef = useRef<HTMLButtonElement>(null);
  const wasSearching = useRef(false);
  const searching = searchOpen || Boolean(query);
  useEffect(() => {
    if (searching) inputRef.current?.focus();
    else if (wasSearching.current) triggerRef.current?.focus();
    wasSearching.current = searching;
  }, [searching]);
  const closeSearch = () => { setSearchOpen(false); setQuery(''); };
  const term = query.trim().toLowerCase();
  const results = data?.filter(trip => !term || `${trip.name} ${PHASE_LABEL[trip.phase]} ${label(trip)}`.toLowerCase().includes(term));
  const open = results?.filter(trip => trip.phase === 'voting') ?? [];
  const other = results?.filter(trip => trip.phase !== 'voting') ?? [];
  const featured = other[0];
  const card = (trip: TripSummary) => {
    const needsVote = trip.phase === 'voting' && trip.setupDone && !trip.myVoted && !trip.myConfirmed;
    const action = trip.phase === 'voting' ? !trip.setupDone ? 'Finish setup' : needsVote ? 'Vote now' : 'See my ballot' : trip.phase === 'final' || savedChoice(trip) ? 'View trip' : !trip.setupDone ? 'Finish setup' : 'View trip';
    return <article key={trip.id} className={`relative flex w-full min-w-0 shrink-0 snap-start flex-col rounded-3xl ${needsVote ? 'bg-orchid/40' : 'bg-pistachio'}`}>
      <div className={`flex h-[84px] items-start justify-between rounded-t-3xl ${needsVote ? 'bg-orchid' : 'bg-matcha'} px-[18px] py-4`}>
        <span className="rounded-xl bg-panel px-2.5 py-[5px] text-xs font-extrabold text-white">{label(trip)}</span>
        <Smiley size={48} fill={needsVote ? 'fill-pistachio' : undefined} />
      </div>
      <div className="flex flex-col gap-1.5 px-[18px] pb-[18px] pt-4">
        <h2 className="break-words font-[inherit] text-[22px] font-extrabold leading-tight tracking-[-0.5px]"><Link href={href(trip)} className={`after:absolute after:inset-0 after:rounded-3xl ${focus}`}>{trip.name}</Link></h2>
        <p className="text-sm text-secondary">{meta(trip)}</p>
        <div className="mt-1.5 flex items-center justify-end"><Link href={href(trip)} className={`relative z-10 flex min-h-11 items-center gap-1.5 rounded-full bg-panel px-[18px] py-2 text-sm font-bold text-white shadow-md hover:brightness-90 active:brightness-75 ${focus}`}>{action} <span aria-hidden="true">→</span></Link></div>
      </div>
    </article>;
  };
  return <Page variant="plain"><div className={`${inter.className} text-indigo`}>
    <p className="px-6 pt-6 text-xs font-extrabold tracking-[0.18em] text-secondary">WSP TRAVEL</p>
    <header className="flex items-center justify-between px-6 pb-3 pt-2">
      {searching ? <div role="search" className="flex w-full items-center gap-3" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); closeSearch(); } }}>
        <div className="relative min-w-0 flex-1"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" className="pointer-events-none absolute left-4 top-3"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l5 5" /></svg>
          <input ref={inputRef} type="search" aria-label="Search your trips" placeholder="Search your trips" value={query} onChange={event => setQuery(event.target.value)} className="h-11 w-full rounded-[22px] border-2 border-outline bg-surface pl-11 pr-4 text-base text-indigo placeholder:text-secondary focus:border-indigo focus:outline-none focus:ring-2 focus:ring-indigo focus:ring-offset-2 focus:ring-offset-surface" />
        </div>
        <button type="button" aria-label="Close search" onClick={closeSearch} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-pistachio ${focus}`}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
      </div> : <><h1 className="font-[inherit] text-[36px] font-extrabold leading-tight tracking-[-1.4px]">Trips</h1><button ref={triggerRef} type="button" aria-label="Search trips" aria-expanded={searching} onClick={() => setSearchOpen(true)} className={`flex h-11 w-11 items-center justify-center rounded-full bg-pistachio ${focus}`}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l5 5" /></svg></button></>}
    </header>
    <p className="sr-only" aria-live="polite" aria-atomic="true">{data && !error ? `${results?.length ?? 0} trips found` : ''}</p>
    {!!open.length && <>
      <h2 className="mb-1 flex items-center gap-2 px-6 font-[inherit] text-sm font-bold text-[#35607A]">Current votes <span className="rounded-full bg-[#CBE6C7] px-2 py-0.5 text-xs font-extrabold text-[#28536B]">{open.length}</span></h2>
      <section aria-label="Current votes" className="flex snap-x snap-mandatory gap-4 scroll-px-6 overflow-x-auto px-6 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {open.map(trip => <Link key={trip.id} href={href(trip)} aria-label={`${trip.name}, voting open, ${trip.myConfirmed ? 'your votes are confirmed' : trip.myVoted ? 'you have voted' : trip.setupDone ? 'you have not voted' : 'finish setup to vote'}`} className={`flex w-16 shrink-0 snap-start flex-col items-center gap-1.5 rounded-xl text-xs font-bold ${focus}`}>
          <span className="relative h-16 w-16 rounded-full border-[3px] border-[#8FB78F] p-[3px]"><span className={`flex h-full w-full items-center justify-center rounded-full text-xl font-extrabold ${colors[trip.id % colors.length]}`}>{initials(trip.name)}</span>{trip.setupDone && !trip.myVoted && !trip.myConfirmed && <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 h-[14px] w-[14px] rounded-full border-2 border-white bg-[#F3A5BC]" />}</span>
          <span className="w-full max-w-[68px] truncate text-center">{trip.name}</span>
        </Link>)}
      </section>
    </>}
    <div className={`flex flex-col gap-4 px-6 ${open.length ? '' : 'pt-1.5'}`}>
      {error && <p role="alert" className="rounded-[20px] border border-orchid bg-surface p-4 text-sm text-maroon">{error}</p>}
      {!data && !error && <TravelSkeleton />}
      {!!open.length && <section aria-label="Trips with voting open" className="-mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-6 px-6 py-2">{open.map(card)}</section>}
      {!!open.length && !!other.length && <h2 className="font-[inherit] text-sm font-bold text-[#35607A]">Other trips</h2>}
      {featured && card(featured)}
      {other.slice(1).map((trip, index) => <Link key={trip.id} href={href(trip)} className={`flex flex-wrap items-center gap-3.5 rounded-[20px] border border-azure bg-surface px-[18px] py-4 ${focus}`}>
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-extrabold ${colors[(index + 1) % colors.length]}`}>{initials(trip.name)}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5"><h2 className="break-words font-[inherit] text-[17px] font-extrabold leading-tight">{trip.name}</h2><p className="text-sm text-secondary">{meta(trip)}</p></div>
        <span className={`shrink-0 rounded-xl px-2.5 py-[5px] text-xs font-extrabold uppercase ${trip.phase === 'setup' ? 'bg-orchid text-orchidink' : 'bg-pistachio text-indigo'}`}>{label(trip)}</span>
      </Link>)}
      {!!term && data && !error && !results?.length && <p role="status" className="break-words py-6 text-center text-[15px] text-secondary">No trips match “{query.trim()}”</p>}
      {!term && data?.length === 0 && <p className="rounded-[20px] border border-azure p-4 text-sm text-secondary">No trips yet. Tap + to create or join one.</p>}
      <Link href="/travel/demo" className={`inline-flex min-h-11 items-center text-sm font-semibold underline ${focus}`}>Try the sample walkthrough</Link>
    </div>
  </div></Page>;
}
