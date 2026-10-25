'use client';
import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, useApi } from '@/lib/client';
import { type Vote } from '@/lib/travel/core';
import { formatTripDates } from '@/lib/travel/format';
import { TravelFrame, TravelSkeleton, ComparisonCards, DiscoverySummaryNote, FareWarning, travelButton, travelQuiet } from '@/components/TravelUI';

function deadlineLabel(deadline: string | undefined, now: number) {
  if (!deadline) return 'Destination vote';
  const minutes = Math.ceil((Date.parse(deadline) - now) / 60000);
  if (minutes <= 0) return 'Voting is closing…';
  return minutes >= 60 ? `Voting ends in ${Math.floor(minutes / 60)}h ${minutes % 60}m` : `Voting ends in ${minutes}m`;
}
export default function TravelPlans({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, error, reload } = useApi<any>(`/api/travel/${id}`, 3000, true);
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false), [now, setNow] = useState(Date.now);
  const [mine, setMine] = useState<Record<number, Vote | null>>({});
  const inFlight = useRef(false);
  const comparison = data?.comparison;
  const open = comparison?.status === 'voting';
  const ownReady = data?.members.some((m: any) => m.id === data.me && m.ready);
  const removed: number[] = comparison?.removedOptionIds ?? [];
  const options = comparison?.options.filter((o: any) => !removed.includes(o.id)) ?? [];
  const myVotes = options.flatMap((o: any) => {
    const value = o.id in mine ? mine[o.id] : comparison.myVotes.find((b: any) => b.optionId === o.id)?.value;
    return value == null ? [] : [{ optionId: o.id, value }];
  });
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (comparison?.status === 'final') router.replace(`/travel/${id}/final`); }, [comparison?.status, id, router]);
  useEffect(() => { if (!inFlight.current) setMine({}); }, [comparison?.id]);
  const act = async (path: string, body: any) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setErr('');
    try { await api(`/api/travel/${id}${path}`, 'POST', body); await reload(); }
    catch (e: any) { setErr(e.message); await reload(); }
    finally { inFlight.current = false; setBusy(false); setMine({}); }
  };
  const vote = (optionId: number, value: Vote) => {
    if (!open || !ownReady || comparison.myConfirmed || inFlight.current) return;
    const next = myVotes.find((b: any) => b.optionId === optionId)?.value === value ? null : value;
    setMine(m => ({ ...m, [optionId]: next }));
    return act('/vote', { comparisonId: comparison.id, optionId, value: next });
  };
  const memberCount = comparison?.memberCount ?? data?.members.length ?? 0;
  const voted = Math.min(memberCount, Math.max(0, (comparison?.voted ?? 0) - Number(comparison?.myVotes.length > 0) + Number(myVotes.length > 0)));
  return <TravelFrame title="Where should we meet?" back={`/travel/${id}`}>
    {!data && !error && <TravelSkeleton />}
    {(error || err) && <p role="alert" className="text-sm font-semibold text-maroon">{err || error}</p>}
    {data && <>
      <p className="text-[15px] font-semibold text-secondary">{data.name}{data.dates && ` · ${formatTripDates(data.dates.depart, data.dates.return)}`}</p>
      {!ownReady && <Link href={`/travel/${id}/setup`} className={`${travelButton} w-full`}>Finish my setup</Link>}
      <div className="flex flex-wrap gap-2 text-xs font-bold">
        <span className="chip-pink">{open ? deadlineLabel(comparison.deadline, now) : 'Voting closed'}</span>
        <span className="chip" aria-live="polite">{voted} of {memberCount} have voted</span>
        <span className="chip">{comparison?.confirmed ?? 0} confirmed</span>
      </div>
      {open ? <FareWarning expired={comparison.expired} /> : <section className="space-y-3 rounded-2xl border border-azure p-4">
        <p role="status" className="text-sm">{comparison?.status === 'final' ? 'Voting closed. Meeting place picked.' : comparison?.status === 'vetoed' ? 'No destination won. Try new options.' : comparison?.status === 'stale' ? 'Trip changed. A new search is needed.' : comparison?.status === 'generating' ? 'Flight search in progress.' : comparison?.error ?? 'No flight search yet.'}</p>
        <Link href={comparison?.status === 'final' ? `/travel/${id}/final` : `/travel/${id}/finding`} className={travelQuiet}>{comparison?.status === 'final' ? 'See meeting place' : 'See flight search'}</Link>
      </section>}
      <DiscoverySummaryNote summary={comparison?.summary} />
      {removed.length > 0 && <p role="status" className="text-sm text-secondary">{removed.length} removed by majority veto.</p>}
      {!!options.length && <ComparisonCards options={options} myVotes={myVotes} voting={open && ownReady && !comparison.myConfirmed} busy={busy} onVote={vote} />}
      {open && ownReady && <>
        <p className="text-center text-[13px] text-secondary">{comparison.myConfirmed ? 'Votes confirmed. Waiting for the group.' : `Voted on ${myVotes.length} of ${options.length} · confirmed votes are final`}</p>
        {!comparison.myConfirmed && <button disabled={busy || myVotes.length !== options.length || !options.length || !comparison.canConfirm} onClick={() => act('/confirm', { comparisonId: comparison.id })} className={`${travelButton} w-full`}>{busy ? 'Saving…' : 'Confirm my votes'}</button>}
      </>}
      {open && ownReady && data.organizer && <button disabled={busy} onClick={() => act('/close', { comparisonId: comparison.id })} className={`${travelQuiet} w-full`}>Close voting now</button>}
      {data.savedFinal && comparison?.status !== 'final' && <Link href={`/travel/${id}/final`} className="block text-center text-sm font-bold underline">See the saved meeting place</Link>}
    </>}
  </TravelFrame>;
}
