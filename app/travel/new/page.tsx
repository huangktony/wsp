'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/client';
import { defaultDates, validateDates } from '@/lib/travel/discovery';
import { travelEntry } from '@/lib/travel/flow';
import { TravelFrame, DatesEditor, travelButton, travelInput, travelQuiet, travelFocus } from '@/components/TravelUI';
export default function CreateTrip() {
  const [name,setName] = useState(''), [dates,setDates] = useState(defaultDates), [code,setCode] = useState('');
  const [createError,setCreateError] = useState(''), [joinError,setJoinError] = useState('');
  const [action,setAction] = useState<'create'|'join'|null>(null);
  const inFlight = useRef(false);
  const router = useRouter();
  const run = async (source:'create'|'join', request:()=>Promise<{id:number;setupDone?:boolean}>) => {
    if(inFlight.current)return;
    inFlight.current=true;setAction(source);
    const setError=source==='create'?setCreateError:setJoinError;
    setError('');
    try { const trip=await request();router.push(travelEntry(trip.id,source==='join'&&trip.setupDone===true)); }
    catch(e:any) { setError(e.message); }
    finally { inFlight.current=false;setAction(null); }
  };
  return <TravelFrame title="Create or join a trip." back="/travel">
    <section aria-labelledby="join-trip-heading" className="rounded-2xl bg-pistachio p-4">
      <h2 id="join-trip-heading" className="mb-3 font-[inherit] text-lg font-extrabold">Have an invite?</h2>
      <form aria-label="Join trip" className="space-y-3" onSubmit={e=>{e.preventDefault();return run('join',()=>api('/api/travel/join','POST',{code}));}}>
        <label className="block text-sm font-bold">Travel invite code<input required maxLength={32} value={code} onChange={e=>setCode(e.target.value)} placeholder="TRIP-…" autoCapitalize="characters" aria-describedby={joinError?'join-trip-error':undefined} className={`${travelInput} mt-1`}/></label>
        {joinError&&<p id="join-trip-error" role="alert" className="text-sm text-maroon">{joinError}</p>}
        <button disabled={!code.trim()||action!==null} aria-busy={action==='join'} className={`${travelQuiet} w-full`}>{action==='join'?'Joining…':'Join trip'}</button>
      </form>
    </section>
    <section aria-labelledby="create-trip-heading">
      <h2 id="create-trip-heading" className="mb-4 font-[inherit] text-xl font-extrabold">Or make a meeting place.</h2>
      <form aria-label="Create trip" className="space-y-5" onSubmit={e=>{e.preventDefault();return run('create',async()=>{const sharedDates=validateDates(dates);return api('/api/travel','POST',{name,dates:sharedDates});});}}>
        <label className="block text-sm font-bold">Trip name<input required maxLength={60} value={name} onChange={e=>setName(e.target.value)} placeholder="The long-overdue reunion" aria-describedby={createError?'create-trip-error':undefined} className={`${travelInput} mt-1`} /></label>
        <DatesEditor value={dates} onChange={setDates} />
        {createError&&<p id="create-trip-error" role="alert" className="text-sm text-maroon">{createError}</p>}
        <button disabled={!name.trim()||action!==null} aria-busy={action==='create'} className={`${travelButton} w-full`}>{action==='create'?'Creating…':'Create trip & invite friends'}</button>
      </form>
    </section>
    <Link href="/travel/demo" className={`inline-flex min-h-11 items-center text-sm font-bold underline ${travelFocus}`}>Try the demo instead</Link>
  </TravelFrame>;
}
