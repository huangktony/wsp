'use client';
import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api,useApi } from '@/lib/client';
import { findingDestination } from '@/lib/travel/flow';
import { TravelFrame,TravelSkeleton,TravelArt,ComparisonCards,DiscoverySummaryNote,travelButton,travelQuiet,travelFocus } from '@/components/TravelUI';
export default function FindingFlights({params}:{params:Promise<{id:string}>}) {
  const {id}=use(params);const router=useRouter();
  const {data,error,reload}=useApi<any>(`/api/travel/${id}`,3000,true);
  const [busy,setBusy]=useState(false),[err,setErr]=useState(''),[observedId,setObservedId]=useState<number|null>(null);
  const inFlight=useRef(false);
  const comparison=data?.comparison;
  const allReady=!!data?.members.length&&data.members.every((m:any)=>m.ready);
  const ownReady=data?.members.some((m:any)=>m.id===data.me&&m.ready);
  // Observe an existing generation without POSTing. A direct visit to a final or
  // voting comparison keeps explicit refresh available instead of redirecting in a loop.
  useEffect(()=>{
    if(busy)return;
    if(comparison?.status==='generating')setObservedId(comparison.id);
    const destination=findingDestination(id,comparison,observedId);
    if(destination)router.replace(destination);
  },[id,comparison?.id,comparison?.status,comparison?.expired,observedId,busy,router]);
  const start=async()=>{
    if(inFlight.current)return;
    inFlight.current=true;setBusy(true);setErr('');setObservedId(null);
    try{
      const result=await api(`/api/travel/${id}/compare`,'POST',undefined,AbortSignal.timeout(155000));
      setObservedId(result.comparisonId);await reload();
    }catch(e:any){setErr(e.name==='TimeoutError'?'Flight search took too long. Check its status below before retrying.':e.message);await reload();}
    finally{inFlight.current=false;setBusy(false);}
  };
  const pending=comparison?.status==='generating'&&!comparison.stalled;
  const saved=data?.savedFinal??(comparison?.status==='final'?comparison:null);
  const locked=!!saved?.confirmedAt;
  const agreed=!saved || (saved.redraw?.votes??0)>=(saved.redraw?.needed??Infinity);
  const open=comparison?.status==='voting';
  return <TravelFrame title="Find your meeting place." back={`/travel/${id}`}>
    <TravelArt/>
    {!data&&!error&&<TravelSkeleton/>}
    {(error||err)&&<p role="alert" className="rounded-2xl border border-orchid p-4 text-sm text-maroon">{err||error}</p>}
    {data&&<>
      <p className="text-sm text-secondary">Discovering destinations for {data.name}, with round-trip flights that fit everyone’s private limits.</p>
      {(busy||pending)&&<p role="status" className="rounded-2xl bg-pistachio p-4 text-sm">Finding fares for everyone. This can take up to three minutes. You can return to the lobby; the search keeps its place.</p>}
      {comparison?.stalled&&<p role="status" className="text-sm text-maroon">This search stopped responding. The organizer can retry without using the old results.</p>}
      {comparison?.status==='stale'&&<p role="status" className="text-sm text-secondary">Trip settings changed. Start a new comparison using the current travelers and dates.</p>}
      {comparison?.status==='vetoed'&&<p role="status" className="text-sm text-secondary">No destination won this round. You can change shared dates in the lobby or review your own private budget before searching again.</p>}
      {comparison?.expired&&<p role="status" className="text-sm text-secondary">These fare estimates have expired. Votes and the saved choice remain available; recheck fares before booking.</p>}
      {comparison?.error&&<p role="alert" className="text-sm text-maroon">{comparison.error}</p>}
      {comparison?.status!=='generating'&&<DiscoverySummaryNote summary={comparison?.summary}/>}
      {comparison?.status==='failed'&&comparison.options.length>0&&<ComparisonCards options={comparison.options} myVotes={[]} voting={false}/>}
      {comparison?.status==='voting'&&<Link href={`/travel/${id}/plans`} className={`${travelButton} w-full`}>Continue to destination voting</Link>}
      {saved&&<Link href={`/travel/${id}/final`} className={`${travelQuiet} w-full`}>See the picked meeting place</Link>}
      {!ownReady?<Link href={`/travel/${id}/setup`} className={`${travelButton} w-full`}>Finish my setup</Link>:data.organizer?<section className="space-y-3">
        {locked?<p role="status" className="text-sm text-secondary">The meeting place is confirmed. New searches are locked.</p>:open?<p className="text-sm text-secondary">A destination vote is already open. Continue voting without restarting the search.</p>:!agreed?<p className="text-sm text-secondary">The group must agree to new destinations first. Ask for new options from your saved meeting place.</p>:<>
          <p className="text-sm text-secondary">{allReady?saved?'The group agreed to new options. Your saved meeting place stays available until a replacement wins.':'Start when you’re ready. Opening this page does not start a paid search.':'Waiting for everyone’s airport and private flight budget.'}</p>
          <button disabled={busy||pending||!allReady} onClick={start} className={`${travelButton} w-full`}>{busy?'Finding flights…':pending?'Search in progress':comparison?.status==='failed'||comparison?.stalled?'Retry flight search':comparison?'Find new destinations':'Find flights'}</button>
        </>}
      </section>:<p className="text-sm text-secondary">{pending?'You’ll continue to voting when the organizer’s search is ready.':'Ask the organizer to start or refresh the flight comparison.'}</p>}
      <button onClick={()=>reload()} className={`${travelQuiet} w-full`}>Check search status</button>
    </>}
    <Link href={`/travel/${id}`} className={`inline-flex min-h-11 items-center text-sm font-bold underline ${travelFocus}`}>Back to trip lobby</Link>
  </TravelFrame>;
}
