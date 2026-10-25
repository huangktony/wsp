'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TravelFrame, TravelArt, DatesEditor, ComparisonCards, DiscoverySummaryNote, TravelNotice, travelButton, travelQuiet, travelInput } from '@/components/TravelUI';
import { DEMO_MEMBERS, initialDemo, restoreDemo, demoDiscovery, demoVote, type DemoState } from '@/lib/travel/demo';
import { validateDates } from '@/lib/travel/discovery';
import { airportName } from '@/lib/travel/core';
const KEY = 'wsp-travel-demo-v2';
export default function TravelDemo() {
  const [state,setState] = useState<DemoState>(initialDemo);
  const [draft,setDraft] = useState(state.dates);
  const [loaded,setLoaded] = useState(false);
  const [error,setError] = useState('');
  useEffect(() => { try { const raw = localStorage.getItem(KEY); if (raw) { const restored = restoreDemo(raw); setState(restored); setDraft(restored.dates); } } catch {} setLoaded(true); }, []);
  useEffect(() => { if (loaded) { try { localStorage.setItem(KEY,JSON.stringify(state)); } catch {} } }, [state,loaded]);
  const { options,summary } = demoDiscovery(state.dates);
  const active = DEMO_MEMBERS.find(m => m.id === state.voter)!;
  const reset = () => { const next = initialDemo(); setState(next); setDraft(next.dates); setError(''); };
  return <TravelFrame title="Different cities. Same weekend." eyebrow="WSP TRAVEL · INTERACTIVE DEMO" demo>
    <p className="rounded-2xl bg-orchid p-4 text-sm font-semibold text-orchidink">DEMO · Sample round-trip fares and simulated private checks. No login, bank connection, live searches or real votes.</p>
    <TravelArt />
    <p className="text-sm text-secondary">Steph in El Paso, Tony in Houston, Ravi in Chicago. Choose shared dates; WSP discovers places that fit all three illustrative private flight caps. Then switch travelers to try their ballots.</p>
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); try { const dates = validateDates(draft); setState({ ...state,dates,ballots:[],status:'voting',winnerId:null }); setError(''); } catch (e: any) { setError(e.message); } }}>
      <details className="rounded-2xl border border-azure p-4"><summary className="cursor-pointer font-bold">Edit shared sample dates</summary><div className="mt-4"><DatesEditor value={draft} onChange={setDraft} /></div><p className="mt-3 text-xs text-secondary">Sample fares are fixed illustrations, not prices for the dates you choose.</p><button className={`${travelButton} mt-3`}>Discover sample destinations</button></details>
    </form>
    {error && <p role="alert" className="text-sm text-maroon">{error}</p>}
    <label className="block text-sm font-bold">DEMO · Simulate traveler<select value={state.voter} onChange={e => setState({ ...state,voter:Number(e.target.value) })} className={`${travelInput} mt-2`}>{DEMO_MEMBERS.map(m => <option key={m.id} value={m.id}>{m.name} · {m.airport}</option>)}</select></label>
    <div aria-live="polite" className="rounded-2xl bg-pistachio p-4 text-sm"><p className="font-bold">{state.status === 'final' ? `Meet in ${airportName(options.find(o => o.id === state.winnerId)!.airport)}!` : state.status === 'vetoed' ? 'Every option was vetoed. Try different shared dates.' : `${active.name}’s sample ballot`}</p><p className="mt-1 text-secondary">{state.status === 'voting' ? `${new Set(state.ballots.map(b => b.userId)).size} of 3 have voted. Vote on every option as each traveler to reveal the winner.` : 'Voting is closed. Reset or discover new sample options to try again.'}</p></div>
    <DiscoverySummaryNote summary={summary} demo/>
    <ComparisonCards options={options} myVotes={state.ballots.filter(b => b.userId === state.voter)} voting={state.status === 'voting'} winnerId={state.winnerId} demo onVote={(id,value) => setState(s => demoVote(s,id,value))} />
    <button type="button" className={`${travelQuiet} w-full`} onClick={reset}>Reset demo</button>
    <TravelNotice /><Link href="/travel" className={`${travelButton} w-full`}>Plan a real trip</Link>
  </TravelFrame>;
}
