'use client';
import { use } from 'react';
import Link from 'next/link';
import { useApi } from '@/lib/client';
import { airportName } from '@/lib/travel/core';
import { TravelFrame,ComparisonCards,TravelNotice,travelButton,travelQuiet,travelFocus } from '@/components/TravelUI';
export default function TravelFinal({params}:{params:Promise<{id:string}>}) {
  const {id}=use(params);const {data,error}=useApi<any>(`/api/travel/${id}`,5000,true);
  const comparison=data?.comparison;
  const picked=comparison?.status==='final'?comparison.options.find((o:any)=>o.id===comparison.winnerId):null;
  return <TravelFrame title={picked?`Meet in ${airportName(picked.airport)}.`:'Your meeting place'} eyebrow="WSP TRAVEL · FINAL CHOICE">
    {!data&&!error&&<p role="status">Loading your meeting place…</p>}
    {error&&<p role="alert" className="text-sm text-maroon">{error}</p>}
    {data&&<>
      {picked?<>
        <p role="status" className="rounded-2xl bg-matcha p-4 text-sm font-bold text-matchaink">{data.name} has a meeting place. Voting is closed.</p>
        {comparison.expired&&<p className="text-sm text-secondary">These fare estimates have expired. Your choice is saved; recheck fares before booking.</p>}
        <ComparisonCards options={[picked]} myVotes={[]} voting={false} winnerId={picked.id} showRecommendation={false}/>
        <p className="text-xs text-secondary">Private checks reflect the comparison time and become unavailable after five minutes. Recheck links open a new flight search; they do not book tickets.</p>
        <TravelNotice/>
        {data.organizer&&<><Link href={`/travel/${id}/finding`} className={`${travelQuiet} w-full`}>Review a new flight comparison</Link><p className="text-xs text-secondary">Starting a new comparison clears the previous vote. Opening the search page won’t refresh fares until you choose to start.</p></>}
      </>:<section className="space-y-4 rounded-2xl border border-azure p-4"><p role="status" className="text-sm">{comparison?.status==='stale'?'Trip settings changed. A new comparison is needed before choosing a meeting place.':'No meeting place has been picked for this comparison yet.'}</p><Link href={`/travel/${id}`} className={travelButton}>Return to trip lobby</Link></section>}
    </>}
    <Link href={`/travel/${id}`} className={`inline-flex min-h-11 items-center text-sm font-bold underline ${travelFocus}`}>Back to trip lobby</Link>
  </TravelFrame>;
}
