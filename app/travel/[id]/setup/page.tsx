'use client';
import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, useApi } from '@/lib/client';
import { validateSetup } from '@/lib/travel/core';
import { TravelFrame, AirportSelect, travelButton, travelInput } from '@/components/TravelUI';
export default function TravelSetup({ params }: { params: Promise<{ id:string }> }) {
  const {id}=use(params); const router=useRouter();
  const {data,error}=useApi<{airport:string|null;budget:number|null}>(`/api/travel/${id}/me`);
  const [airport,setAirport]=useState(''),[budget,setBudget]=useState(''),[err,setErr]=useState(''),[busy,setBusy]=useState(false);
  const dirty=useRef(false);
  useEffect(()=>{if(data&&!dirty.current){setAirport(data.airport??'');setBudget(data.budget==null?'':String(data.budget));}},[data]);
  return <TravelFrame title="Your starting point.">
    <p className="text-sm text-secondary">Your home airport is shared with the trip. Your maximum round-trip flight budget is private to you. Saving a change clears the trip’s previous comparison and votes.</p>
    {error && <p role="alert" className="text-sm text-maroon">{error}</p>}
    {!data && !error && <p role="status">Loading your private setup…</p>}
    {data && <form className="space-y-4" onSubmit={async e=>{e.preventDefault();setBusy(true);setErr('');try{const setup=validateSetup({airport,budget:Number(budget)});await api(`/api/travel/${id}/me`,'PUT',setup);router.push(`/travel/${id}`);}catch(e:any){setErr(e.message);}finally{setBusy(false);}}}>
      <AirportSelect label="Your home airport" value={airport} onChange={value=>{dirty.current=true;setAirport(value);}}/>
      <label className="block text-sm font-bold">Private maximum flight budget (USD)<input required inputMode="decimal" type="number" min="0.01" max="100000" step="0.01" value={budget} onChange={e=>{dirty.current=true;setBudget(e.target.value);}} className={`${travelInput} mt-1`}/></label>
      <p className="rounded-2xl bg-pistachio p-4 text-xs leading-relaxed text-secondary">We compare fares against your cap and a conservative Nessie sandbox estimate after recorded spending and unpaid obligations. Friends see only a neutral check, never your cap, balance or transactions. Unlinked, simulated or unavailable accounts are never marked verified.</p>
      <p className="text-xs text-secondary">Flight budget only; excludes hotels, food and ground transport. Manage your existing sandbox account from <Link href="/spending" className="font-bold underline">Budget</Link>. Travel does not create accounts or move money.</p>
      {err&&<p role="alert" className="text-sm text-maroon">{err}</p>}<button disabled={busy} className={`${travelButton} w-full`}>{busy?'Saving…':'Save my setup'}</button>
    </form>}
    <Link href={`/travel/${id}`} className="block text-sm font-bold underline">Back to trip</Link><Link href="/travel/demo" className="block text-sm underline">Try the sample demo</Link>
  </TravelFrame>;
}
