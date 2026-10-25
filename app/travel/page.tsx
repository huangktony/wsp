'use client';
import Link from 'next/link';
import { useApi } from '@/lib/client';
import { PHASE_LABEL, travelEntry, type TravelPhase } from '@/lib/travel/flow';
import { TravelFrame, travelButton, travelQuiet, travelFocus } from '@/components/TravelUI';
type TripSummary = { id:number; name:string; members:number; ready:number; setupDone:boolean; phase:TravelPhase; myVoted:boolean };
export default function TravelHome() {
  const { data,error } = useApi<TripSummary[]>('/api/travel',5000,true);
  const voting = data?.filter(t=>t.phase==='voting')??[];
  const remaining = data?.filter(t=>t.phase!=='voting')??[];
  return <TravelFrame title="Your trips.">
    <p className="text-sm text-secondary">Different starting points. One place to meet.</p>
    {error && <p role="alert" className="text-sm text-maroon">{error}</p>}
    {!data && !error && <p role="status" className="text-sm text-secondary">Loading your trips…</p>}
    {!!voting.length&&<section aria-label="Trips with voting open" className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5 px-5 py-2">{voting.map(t=><article key={t.id} className="w-full min-w-0 shrink-0 snap-start rounded-3xl bg-pistachio p-5">
      <p className="mb-3 text-xs font-extrabold uppercase tracking-wide text-secondary">Voting open</p><h2 className="break-words font-[inherit] text-2xl font-extrabold">{t.name}</h2><p className="mt-2 text-sm text-secondary">{t.members} travelers · flight options ready</p>
      <Link href={t.setupDone?`/travel/${t.id}/plans`:travelEntry(t.id,false)} className={`${travelButton} mt-4 w-full`}>{!t.setupDone?'Finish my setup':t.myVoted?'Change vote':'Vote on destinations'}</Link>
      <Link href={`/travel/${t.id}`} className={`mt-2 inline-flex min-h-11 items-center text-sm font-bold underline ${travelFocus}`}>Trip lobby</Link>
    </article>)}</section>}
    <section aria-label="Other trips" className="space-y-3">{remaining.map(t=><Link key={t.id} href={travelEntry(t.id,t.setupDone)} className={`${travelQuiet} !flex !justify-between gap-3 !p-4`}><span className="min-w-0 break-words">{t.name}<span className="mt-1 block text-xs font-normal text-secondary">{t.ready} of {t.members} ready</span></span><span className="max-w-[40%] text-right text-xs">{PHASE_LABEL[t.phase]}</span></Link>)}</section>
    {data?.length === 0 && <p className="rounded-2xl border border-azure p-4 text-sm text-secondary">No trips yet. Tap + to create a trip or join with an invite code.</p>}
    <Link href="/travel/demo" className={`inline-flex min-h-11 items-center text-sm font-semibold underline ${travelFocus}`}>Want a walkthrough? Try the sample demo</Link>
  </TravelFrame>;
}
