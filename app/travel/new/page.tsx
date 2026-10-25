'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Inter } from 'next/font/google';
import { BackButton } from '@/components/BackButton';
import { InviteCodeInput } from '@/components/InviteCodeInput';
import { Page } from '@/components/Page';
import { DatesEditor, ScopePicker } from '@/components/TravelUI';
import { api } from '@/lib/client';
import { TRAVEL_CODE } from '@/lib/inviteCodeInput';
import { defaultDates, validateDates } from '@/lib/travel/discovery';
import { travelEntry } from '@/lib/travel/flow';

// Same look and structure as "Start a group" on the Hangout side.
const inter = Inter({ subsets: ['latin'], weight: ['400', '600', '700', '800'] });
const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo';
const input = 'box-border h-[54px] w-full rounded-2xl border-2 border-outline bg-surface px-4 font-[inherit] text-base text-indigo placeholder:text-secondary/80 focus:border-indigo focus:outline-none focus:ring-2 focus:ring-indigo focus:ring-offset-2 focus:ring-offset-surface';

export default function CreateTrip() {
  const [name,setName] = useState(''), [dates,setDates] = useState(defaultDates), [code,setCode] = useState('TRIP-');
  const [isComplete,setIsComplete] = useState(false);
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
  const busy = action !== null;
  const join = () => { if (isComplete && !busy) void run('join',()=>api('/api/travel/join','POST',{code})); };
  return <Page variant="plain">
    <div className={`${inter.className} flex min-h-[calc(100svh-var(--tab-bar-height))] flex-col gap-[18px] px-6 pb-[132px] pt-6 text-indigo`}>
      <BackButton href="/travel" className="mb-2" />
      <h1 className="font-[inherit] text-[36px] font-extrabold leading-[1.05] tracking-[-1.4px]">Start a trip</h1>
      <form id="create-trip" aria-label="Create trip" className="flex flex-col gap-6" onSubmit={e=>{e.preventDefault();if(!name.trim()||busy)return;return run('create',async()=>{const sharedDates=validateDates(dates);return api('/api/travel','POST',{name,dates:sharedDates});});}}>
        <input type="text" required maxLength={60} aria-label="Trip name" placeholder="Trip name" value={name} onChange={e=>setName(e.target.value)} aria-describedby={createError?'create-trip-error':undefined} className={input} />
        <DatesEditor value={dates} onChange={setDates} tall />
        <ScopePicker value={dates.scope} onChange={scope=>setDates({...dates,scope})} tall />
        {createError&&<p id="create-trip-error" role="alert" className="text-sm text-maroon">{createError}</p>}
      </form>
      <section aria-labelledby="join-trip-heading" className="mt-1.5 rounded-3xl bg-pistachio p-5">
        <h2 id="join-trip-heading" className="mb-3 font-[inherit] text-[13px] font-bold uppercase text-secondary">OR JOIN WITH A CODE</h2>
        <div className="flex gap-2.5">
          <InviteCodeInput spec={TRAVEL_CODE} value={code} onChange={(fullCode, complete) => { setCode(fullCode); setIsComplete(complete); }}
            onSubmit={join} describedBy={joinError ? 'join-trip-error' : undefined} className="min-w-0 flex-1" />
          <button type="button" disabled={!isComplete || busy} aria-disabled={!isComplete || busy} aria-busy={action==='join'} onClick={join} className={`h-[54px] shrink-0 rounded-2xl bg-panel px-[22px] text-base font-extrabold text-white disabled:pointer-events-none disabled:opacity-50 ${focus}`}>Join</button>
        </div>
        {joinError&&<p id="join-trip-error" role="alert" className="mt-3 text-sm text-maroon">{joinError}</p>}
      </section>
      <div className="fixed bottom-[var(--tab-bar-height)] left-1/2 z-20 w-full max-w-[390px] -translate-x-1/2 border-t border-azure bg-surface px-6 pb-[30px] pt-3.5">
        <button type="submit" form="create-trip" disabled={!name.trim() || busy} aria-busy={action==='create'} className={`flex h-14 w-full items-center justify-center rounded-2xl bg-matcha text-[17px] font-extrabold text-matchaink disabled:pointer-events-none disabled:opacity-50 ${focus}`}>Create trip</button>
      </div>
    </div>
  </Page>;
}
