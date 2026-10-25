'use client';
import { use, useRef, useState } from 'react';
import Link from 'next/link';
import { api, useApi } from '@/lib/client';
import { airportName } from '@/lib/travel/core';
import { TravelFrame, TravelSkeleton, ComparisonCards, TravelNotice, travelButton, travelQuiet } from '@/components/TravelUI';
export default function TravelFinal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, reload } = useApi<any>(`/api/travel/${id}`, 5000, true);
  const [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const inFlight = useRef(false);
  const comparison = data?.comparison?.status === 'final' ? data.comparison : data?.savedFinal;
  const picked = comparison?.options.find((o: any) => o.id === comparison.winnerId);
  const redraw = comparison?.redraw;
  const request = async (path = '/redraw') => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setErr('');
    try { await api(`/api/travel/${id}${path}`, 'POST', { comparisonId: comparison.id }); await reload(); }
    catch (e: any) { setErr(e.message); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <TravelFrame title={picked ? `Meet in ${airportName(picked.airport)}.` : 'Your meeting place'} back={`/travel/${id}`}>
    {!data && !error && <TravelSkeleton />}
    {(error || err) && <p role="alert" className="text-sm text-maroon">{err || error}</p>}
    {data && (picked ? <>
      <p className="text-[15px] font-semibold text-secondary">{data.name}</p>
      {comparison.expired && <p className="text-sm text-secondary">Fares expired. Recheck before booking.</p>}
      <ComparisonCards options={[picked]} myVotes={[]} voting={false} winnerId={picked.id} showRecommendation={false} />
      <TravelNotice />
      {data.comparison?.id !== comparison.id && <section className="space-y-3 rounded-2xl bg-pistachio p-4"><p className="text-sm">{data.comparison?.status === 'failed' ? 'The new search failed. This pick is still saved.' : 'A new round is in progress. This pick stays until a new one wins.'}</p><Link href={`/travel/${id}/${data.comparison?.status === 'voting' ? 'plans' : 'finding'}`} className={travelQuiet}>See new round</Link></section>}
      {comparison.settingsChanged && <p role="status" className="text-sm text-secondary">Trip settings changed since this pick.</p>}
      {data.organizer && !comparison.settingsChanged && !comparison.confirmedAt && (!data.comparison || data.comparison.id === comparison.id || !['generating', 'voting'].includes(data.comparison.status)) && <button disabled={busy} onClick={() => request('/confirm-final')} className={`${travelButton} w-full`}>Confirm this meeting place</button>}
      {comparison.confirmedAt && <p role="status" className="text-center text-sm font-bold text-matchaink">Meeting place confirmed.</p>}
      {redraw && !redraw.locked && !comparison.confirmedAt && <section className="space-y-3" aria-label="Request new destinations">
        <p role="status" className="text-center text-[13px] text-secondary">{redraw.votes} of {redraw.members} want new options · {redraw.needed} needed</p>
        <button disabled={busy} aria-pressed={redraw.mine} onClick={() => request()} className={`${travelQuiet} w-full`}>{busy ? 'Saving…' : redraw.mine ? 'You asked for new options · Undo' : 'Not feeling it? Ask for new options'}</button>
        {redraw.votes >= redraw.needed && data.organizer && <Link href={`/travel/${id}/finding`} className={`${travelButton} w-full`}>Find new destinations</Link>}
      </section>}
    </> : <section className="space-y-4 rounded-2xl border border-azure p-4"><p role="status" className="text-sm">No meeting place has been picked yet.</p><Link href={`/travel/${id}`} className={travelButton}>Return to trip lobby</Link></section>)}
  </TravelFrame>;
}
