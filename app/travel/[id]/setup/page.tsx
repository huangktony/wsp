'use client';
import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, useApi } from '@/lib/client';
import { validateSetup } from '@/lib/travel/core';
import { TravelFrame, TravelSkeleton, AirportSelect, travelButton, travelInput, travelFocus } from '@/components/TravelUI';
const COMFORT = [{ amount: 200, label: 'Keep it light' }, { amount: 400, label: 'A little room' }, { amount: 700, label: 'More flexibility' }];
export default function TravelSetup({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const router = useRouter();
  const { data, error } = useApi<{ airport: string | null; budget: number | null }>(`/api/travel/${id}/me`);
  const [airport, setAirport] = useState(''), [budget, setBudget] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const dirty = useRef(false), inFlight = useRef(false);
  useEffect(() => { if (data && !dirty.current) { setAirport(data.airport ?? ''); setBudget(data.budget == null ? '' : String(data.budget)); } }, [data]);
  const setCap = (value: string) => { dirty.current = true; setBudget(value); };
  return <TravelFrame title="Make it work for you." back={`/travel/${id}`}>
    <p className="text-[15px] text-secondary">Your starting point and spending comfort. Everyone fills this out before we find flights.</p>
    {error && <p role="alert" className="text-sm text-maroon">{error}</p>}
    {!data && !error && <TravelSkeleton />}
    {data && <form className="space-y-6" onSubmit={async e => {
      e.preventDefault(); if (inFlight.current) return;
      inFlight.current = true; setBusy(true); setErr('');
      try { const setup = validateSetup({ airport, budget: Number(budget) }); await api(`/api/travel/${id}/me`, 'PUT', setup); router.push(`/travel/${id}`); }
      catch (e: any) { setErr(e.message); }
      finally { inFlight.current = false; setBusy(false); }
    }}>
      <AirportSelect label="Where are you flying from?" value={airport} onChange={value => { dirty.current = true; setAirport(value); }} />
      <fieldset className="rounded-3xl bg-pistachio p-5">
        <legend className="float-left mb-3 w-full text-lg font-extrabold">Your flight comfort</legend>
        <p className="clear-both mb-4 text-sm text-secondary">Pick a maximum round-trip fare, or enter your own. These are flight limits, not a suggested spend.</p>
        <div className="grid grid-cols-3 gap-2" aria-label="Flight budget presets">
          {COMFORT.map(({ amount, label }) => <button key={amount} type="button" aria-pressed={Number(budget) === amount} onClick={() => setCap(String(amount))} className={`min-h-24 rounded-2xl px-2 py-3 ${travelFocus} ${Number(budget) === amount ? 'bg-panel text-white' : 'bg-surface text-indigo'}`}><span className="block text-xl font-extrabold">${amount}</span><span className="mt-1 block text-xs font-semibold">{label}</span></button>)}
        </div>
        <label className="mt-4 block text-sm font-bold">My private flight limit (USD)<input required inputMode="decimal" type="number" min="0.01" max="100000" step="0.01" value={budget} onChange={e => setCap(e.target.value)} className={`${travelInput} mt-2`} /></label>
        <p className="mt-3 text-xs text-secondary">Only you can see your limit. Friends see flight prices and a private check, never your balance.</p>
      </fieldset>
      <section className="rounded-2xl border border-outline p-4 text-sm leading-relaxed text-secondary"><h2 className="mb-2 font-[inherit] font-bold text-indigo">A private budget check</h2><p>Your limit and an available Nessie sandbox check help us find options that fit. An unavailable or simulated account shows ⚠️, never a verified check.</p><Link href="/spending" className={`mt-2 inline-flex min-h-11 items-center font-bold underline ${travelFocus}`}>Manage my budget connection</Link></section>
      <p className="text-xs text-secondary">Flights only; hotels, baggage, food and ground transport are extra. Changes require a new comparison, but your group’s saved final choice stays available.</p>
      {err && <p role="alert" className="text-sm text-maroon">{err}</p>}
      <button disabled={busy} className={`${travelButton} w-full`}>{busy ? 'Saving…' : 'Save my setup'}</button>
    </form>}
  </TravelFrame>;
}
