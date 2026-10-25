'use client';
import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api,useApi } from '@/lib/client';
import { findingDestination } from '@/lib/travel/flow';
import { TravelFrame,TravelSkeleton,TravelArt,ComparisonCards,DiscoverySummaryNote,travelButton,travelQuiet } from '@/components/TravelUI';
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
      {(busy||pending)&&<p role="status" className="rounded-2xl bg-pistachio p-4 text-sm">Searching fares. This can take up to 3 minutes; you can leave this page.</p>}
      {comparison?.stalled&&<p role="status" className="text-sm text-maroon">Search stopped responding. The organizer can retry.</p>}
      {comparison?.status==='stale'&&<p role="status" className="text-sm text-secondary">Trip changed. Run a new search.</p>}
      {comparison?.status==='vetoed'&&<p role="status" className="text-sm text-secondary">No destination won. Try new dates.</p>}
      {comparison?.expired&&<p role="status" className="text-sm text-secondary">Fares expired. Votes are saved.</p>}
      {comparison?.error&&<p role="alert" className="text-sm text-maroon">{comparison.error}</p>}
      {comparison?.status!=='generating'&&<DiscoverySummaryNote summary={comparison?.summary} options={comparison?.options}/>}
      {comparison?.status==='failed'&&comparison.options.length>0&&<ComparisonCards options={comparison.options} myVotes={[]} voting={false}/>}
      {comparison?.status==='voting'&&<Link href={`/travel/${id}/plans`} className={`${travelButton} w-full`}>Continue to destination voting</Link>}
      {saved&&<Link href={`/travel/${id}/final`} className={`${travelQuiet} w-full`}>See the picked meeting place</Link>}
      {!ownReady?<Link href={`/travel/${id}/setup`} className={`${travelButton} w-full`}>Finish my setup</Link>:data.organizer?<section className="space-y-3">
        {locked?<p role="status" className="text-sm text-secondary">Confirmed. New searches are locked.</p>:open?<p className="text-sm text-secondary">A vote is already open.</p>:!agreed?<p className="text-sm text-secondary">The group must vote for new options first.</p>:<>
          {!allReady&&<p className="text-sm text-secondary">Waiting for everyone’s setup.</p>}
          <button disabled={busy||pending||!allReady} onClick={start} className={`${travelButton} w-full`}>{busy?'Finding flights…':pending?'Search in progress':comparison?.status==='failed'||comparison?.stalled?'Retry flight search':comparison?'Find new destinations':'Find flights'}</button>
        </>}
      </section>:<p className="text-sm text-secondary">Waiting for the organizer’s search.</p>}
    </>}
  </TravelFrame>;
}
