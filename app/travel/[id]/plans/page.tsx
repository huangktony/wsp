'use client';
import { use,useEffect,useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api,useApi } from '@/lib/client';
import { type Vote } from '@/lib/travel/core';
import { TravelFrame,ComparisonCards,DiscoverySummaryNote,TravelNotice,travelButton,travelQuiet,travelFocus } from '@/components/TravelUI';
export default function TravelPlans({params}:{params:Promise<{id:string}>}) {
  const {id}=use(params);const router=useRouter();const {data,error,reload}=useApi<any>(`/api/travel/${id}`,3000,true);
  const [busy,setBusy]=useState(false),[err,setErr]=useState('');
  const comparison=data?.comparison;
  const open=comparison?.status==='voting'&&!comparison.expired;
  const ownReady=data?.members.some((m:any)=>m.id===data.me&&m.ready);
  useEffect(()=>{if(comparison?.status==='final')router.replace(`/travel/${id}/final`);},[comparison?.status,id,router]);
  const act=async(path:string,body:any)=>{if(busy)return;setBusy(true);setErr('');try{await api(`/api/travel/${id}${path}`,'POST',body);await reload();}catch(e:any){setErr(e.message);await reload();}finally{setBusy(false);}};
  const vote=(optionId:number,value:Vote)=>act('/vote',{comparisonId:comparison.id,optionId,value:comparison.myVotes.some((b:any)=>b.optionId===optionId&&b.value===value)?null:value});
  return <TravelFrame title="Where should we meet?" eyebrow="WSP TRAVEL · DESTINATION VOTE">
    {!data&&!error&&<p role="status">Loading flight options…</p>}
    {(error||err)&&<p role="alert" className="text-sm text-maroon">{err||error}</p>}
    {data&&<>
      <p className="text-sm font-bold">{data.name}</p>
      {!ownReady&&<Link href={`/travel/${id}/setup`} className={`${travelButton} w-full`}>Finish my setup</Link>}
      {open?<p aria-live="polite" className="rounded-2xl bg-pistachio p-4 text-sm">{comparison.voted} of {data.members.length} have voted. Ballots are anonymous until close. Vote on every available option; tap your selection again to undo it.</p>:<section className="space-y-3 rounded-2xl border border-azure p-4"><p role="status" className="text-sm">{comparison?.status==='final'?'Your meeting place is picked. Voting is closed.':comparison?.expired?'These fares expired. Refresh before voting.':comparison?.status==='vetoed'?'Every option was vetoed. Try different shared dates or review your own private flight budget.':comparison?.status==='stale'?'The trip changed. These options are no longer open for voting.':comparison?.status==='generating'?'The flight search is still in progress.':comparison?.error??'No flight comparison is ready yet.'}</p>
        <Link href={comparison?.status==='final'?`/travel/${id}/final`:`/travel/${id}/finding`} className={travelQuiet}>{comparison?.status==='final'?'See meeting place':comparison?.status==='generating'?'See flight search':data.organizer?'Review & refresh fares':'See comparison status'}</Link>
      </section>}
      <DiscoverySummaryNote summary={comparison?.summary}/>
      {!!comparison?.options.length&&<ComparisonCards options={comparison.options} myVotes={comparison.myVotes} voting={open&&ownReady} busy={busy} onVote={vote}/>}
      {open&&ownReady&&data.organizer&&<button disabled={busy} onClick={()=>act('/close',{comparisonId:comparison.id})} className={`${travelQuiet} w-full`}>Close voting & choose</button>}
      <p className="text-xs text-secondary">Voting closes when every traveler votes on every available option, or when the organizer closes it. Missing routes cannot win.</p>
      <TravelNotice/>
    </>}
    <Link href={`/travel/${id}`} className={`inline-flex min-h-11 items-center text-sm font-bold underline ${travelFocus}`}>Back to trip lobby</Link>
  </TravelFrame>;
}
