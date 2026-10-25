'use client';
import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, useApi } from '@/lib/client';
import { presetsFor, validateSetup, type BudgetSuggestions } from '@/lib/travel/core';
import { TravelFrame, TravelSkeleton, AirportSelect, travelButton, travelInput, travelFocus } from '@/components/TravelUI';
export default function TravelSetup({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const router = useRouter();
  const { data, error } = useApi<{ airport: string | null; budget: number | null; suggestions?: BudgetSuggestions | null }>(`/api/travel/${id}/me`);
  const [airport, setAirport] = useState(''), [budget, setBudget] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const dirty = useRef(false), inFlight = useRef(false);
  useEffect(() => { if (data && !dirty.current) { setAirport(data.airport ?? ''); setBudget(data.budget == null ? '' : String(data.budget)); } }, [data]);
  const setCap = (value: string) => { dirty.current = true; setBudget(value); };
  return <TravelFrame title="Make it work for you." back={`/travel/${id}`}>
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
        <legend className="float-left mb-3 w-full text-lg font-extrabold">Your max round-trip fare</legend>
        <div className="clear-both grid grid-cols-3 gap-2" aria-label="Flight budget presets">
          {presetsFor(data.suggestions).map(({ amount, label }) => <button key={amount} type="button" aria-pressed={Number(budget) === amount} onClick={() => setCap(String(amount))} className={`min-h-24 rounded-2xl px-2 py-3 ${travelFocus} ${Number(budget) === amount ? 'bg-panel text-white' : 'bg-surface text-indigo'}`}><span className="block text-xl font-extrabold">${amount}</span><span className="mt-1 block text-xs font-semibold">{label}</span></button>)}
        </div>
        {data.suggestions && <p className="mt-3 text-sm text-secondary">Based on your ${Math.floor(data.suggestions.available).toLocaleString('en-US')} available.</p>}
        <label className="mt-4 block text-sm font-bold">My private flight limit (USD)<span className="relative mt-2 block"><span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-bold text-secondary">$</span><input required inputMode="decimal" type="number" min="0.01" max="100000" step="0.01" value={budget} onChange={e => setCap(e.target.value)} className={`${travelInput} !pl-7`} /></span></label>
        <p className="mt-3 text-xs text-secondary">Only you see this number.</p>
      </fieldset>
      <Link href="/spending" className={`inline-flex min-h-11 items-center text-sm font-bold underline ${travelFocus}`}>Manage my budget connection</Link>
      {err && <p role="alert" className="text-sm text-maroon">{err}</p>}
      <button disabled={busy} className={`${travelButton} w-full`}>{busy ? 'Saving…' : 'Save my setup'}</button>
    </form>}
  </TravelFrame>;
}
