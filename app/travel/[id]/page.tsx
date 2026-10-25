'use client';
import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api,useApi } from '@/lib/client';
import { defaultDates,validateDates } from '@/lib/travel/discovery';
import { travelPhase,PHASE_LABEL,stageLink } from '@/lib/travel/flow';
import { TravelFrame,TravelSkeleton,DatesEditor,travelButton,travelQuiet,travelFocus } from '@/components/TravelUI';
export default function Trip({params}:{params:Promise<{id:string}>}) {
  const {id}=use(params); const {data,error,reload}=useApi<any>(`/api/travel/${id}`,4000,true);
  const [busy,setBusy]=useState(false),[err,setErr]=useState(''),[editing,setEditing]=useState(false),[draft,setDraft]=useState(defaultDates);
  const [copied,setCopied]=useState(false);const copyTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>()=>{if(copyTimer.current)clearTimeout(copyTimer.current);},[]);
  const datesKey=JSON.stringify(data?.dates);
  useEffect(()=>{if(data?.dates)setDraft(data.dates);},[datesKey]);
  const ready=data?.members.filter((m:any)=>m.ready).length??0,total=data?.members.length??0;
  const ownReady=data?.members.some((m:any)=>m.id===data.me&&m.ready);
  const phase=travelPhase(data?.comparison,ready,total);
  const allReady=total>0&&ready===total;
  const final=data?.comparison?.status==='final'?data.comparison:data?.savedFinal;
  const locked=!!final?.confirmedAt;
  const copy=async()=>{try{await navigator.clipboard.writeText(data.inviteCode);setCopied(true);if(copyTimer.current)clearTimeout(copyTimer.current);copyTimer.current=setTimeout(()=>setCopied(false),2000);}catch{setErr('Could not copy. Select and copy the invite code instead.');}};
  return <TravelFrame title={data?.name??'Trip lobby'} back="/travel">
    {(error||err)&&<p role="alert" className="text-sm text-maroon">{err||error}</p>}
    {!data&&!error&&<TravelSkeleton/>}
    {data&&<>
      <section aria-label="Trip readiness" className="space-y-3 rounded-2xl bg-pistachio p-4"><p className="text-sm font-bold">{ready} of {total} ready <span className="font-normal text-secondary">· {PHASE_LABEL[phase]}</span></p><div role="progressbar" aria-label="Traveler setup readiness" aria-valuenow={ready} aria-valuemin={0} aria-valuemax={total} className="h-3 overflow-hidden rounded-full bg-surface"><div className="h-full rounded-full bg-orchid" style={{width:`${total?ready/total*100:0}%`}}/></div><p className="text-xs text-secondary">{allReady?'Everyone has added an airport and private flight budget.':'Everyone needs an airport and private flight budget before comparing.'}</p></section>
      <section className="rounded-2xl bg-panel p-4 text-white" aria-label="Travel invitation"><p className="text-xs font-bold text-panelsoft">INVITE YOUR PEOPLE</p><p className="mt-2 select-all break-all text-xl font-extrabold tracking-wide">{data.inviteCode}</p><button onClick={copy} className={`${travelQuiet} mt-3 !border-transparent !bg-peach !text-indigo`}><span aria-live="polite">{copied?'Copied':'Copy invite code'}</span></button></section>
      <section aria-label="Travelers"><h2 className="mb-2 font-[inherit] font-bold">Starting from</h2><ul className="divide-y divide-azure">{data.members.map((m:any)=><li key={m.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span className="min-w-0 break-words font-bold">{m.name}{m.id===data.me?' (you)':''}<span className="ml-2 text-secondary">{m.airport??'—'}</span></span><span className="shrink-0 text-xs text-secondary">{m.ready?'Ready':'Setting up'}</span></li>)}</ul></section>
      <section aria-label="Shared travel dates" className="space-y-2 rounded-2xl border border-azure p-4"><h2 className="font-[inherit] font-bold">When you’ll meet</h2><p className="text-sm">{data.dates?`${data.dates.depart} → ${data.dates.return}`:'The organizer needs to set shared dates.'}</p><p className="text-xs text-secondary">No destination to pick yet. WSP finds flight options that fit every traveler’s private limit, then you vote together.</p></section>
      {!ownReady?<Link href={`/travel/${id}/setup`} className={`${travelButton} w-full`}>Finish my setup</Link>:<>
        {phase==='voting'||phase==='final'||phase==='finding'?<Link href={stageLink(id,phase)} className={`${travelButton} w-full`}>{phase==='voting'?'Vote on destinations':phase==='final'?'See meeting place':'See flight search'}</Link>:allReady&&data.organizer?<Link href={`/travel/${id}/finding`} className={`${travelButton} w-full`}>{phase==='ready'?'Find flights':'Review flight search'}</Link>:<p className="text-center text-sm text-secondary">{allReady?'Waiting for the organizer to start a flight comparison.':'Waiting for everyone to finish setup.'}</p>}
        <Link href={`/travel/${id}/setup`} className={`${travelQuiet} w-full`}>Edit my airport & private budget</Link>
      </>}
      {['failed','stale','expired','vetoed'].includes(phase)&&<p role="status" className="text-sm text-secondary">{phase==='failed'?'The last search needs attention. The organizer can review route messages and retry.':phase==='stale'?'Trip settings changed. A new comparison will use everyone’s current choices.':phase==='expired'?'Fare estimates need rechecking before booking. Your destination votes stay saved.':'No destination won. Try different shared dates or review your own private flight budget.'}</p>}
      {final&&phase!=='final'&&<Link href={`/travel/${id}/final`} className={`${travelQuiet} w-full`}>See saved meeting place</Link>}
      {locked&&<p role="status" className="text-sm text-secondary">Your meeting place is confirmed. Shared dates are locked.</p>}
      {data.organizer&&!locked&&<div><button className={`${travelQuiet} w-full`} onClick={()=>setEditing(!editing)} aria-expanded={editing}>Edit shared dates</button>{editing&&<form className="mt-4 space-y-3" onSubmit={async e=>{e.preventDefault();setBusy(true);setErr('');try{const dates=validateDates(draft);await api(`/api/travel/${id}`,'PUT',{dates});await reload();setEditing(false);}catch(e:any){setErr(e.message);}finally{setBusy(false);}}}><DatesEditor value={draft} onChange={setDraft}/><p className="text-xs text-secondary">Changes require a new comparison. Your group’s saved final choice stays available.</p><button disabled={busy} className={travelButton}>{busy?'Saving…':'Save shared dates'}</button></form>}</div>}
    </>}
    <Link href="/travel" className={`inline-flex min-h-11 items-center text-sm font-bold underline ${travelFocus}`}>All trips</Link>
  </TravelFrame>;
}
