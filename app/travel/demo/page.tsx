'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TravelFrame, TravelArt, DatesEditor, ComparisonCards, DiscoverySummaryNote, TravelNotice, travelButton, travelQuiet, travelInput } from '@/components/TravelUI';
import { DEMO_MEMBERS, initialDemo, restoreDemo, demoDiscovery, demoVote, demoConfirm, demoProgress, type DemoState } from '@/lib/travel/demo';
import { validateDates } from '@/lib/travel/discovery';
import { airportName } from '@/lib/travel/core';
const KEY = 'wsp-travel-demo-v3';
export default function TravelDemo() {
  const [state,setState] = useState<DemoState>(initialDemo);
  const [draft,setDraft] = useState(state.dates);
  const [loaded,setLoaded] = useState(false);
  const [error,setError] = useState('');
  useEffect(() => { try { const raw = localStorage.getItem(KEY); if (raw) { const restored = restoreDemo(raw); setState(restored); setDraft(restored.dates); } } catch {} setLoaded(true); }, []);
  useEffect(() => { if (loaded) { try { localStorage.setItem(KEY,JSON.stringify(state)); } catch {} } }, [state,loaded]);
  const { options,summary } = demoDiscovery(state.dates);
  const progress = demoProgress(state);
  const visibleOptions = state.status==='final'?options.filter(o=>o.id===state.winnerId):options.filter(o=>!progress.removedOptionIds.includes(o.id));
  const active = DEMO_MEMBERS.find(m => m.id === state.voter)!;
  const reset = () => { const next = initialDemo(); setState(next); setDraft(next.dates); setError(''); };
  return <TravelFrame title="Different cities. Same weekend." eyebrow="WSP TRAVEL · INTERACTIVE DEMO" demo>
    <p className="rounded-2xl bg-orchid p-4 text-sm font-semibold text-orchidink">Demo · sample fares and simulated checks. Nothing here is real.</p>
    <TravelArt />
    <p className="text-sm text-secondary">Steph in El Paso, Tony in Houston, Ravi in Chicago. Switch travelers to vote as each.</p>
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); try { const dates = validateDates(draft); setState({ ...state,dates,ballots:[],confirmed:[],status:'voting',winnerId:null }); setError(''); } catch (e: any) { setError(e.message); } }}>
      <details className="rounded-2xl border border-azure p-4"><summary className="cursor-pointer font-bold">Edit shared sample dates</summary><div className="mt-4"><DatesEditor value={draft} onChange={setDraft} /></div><button className={`${travelButton} mt-3`}>Discover sample destinations</button></details>
    </form>
    {error && <p role="alert" className="text-sm text-maroon">{error}</p>}
    <label className="block text-sm font-bold">DEMO · Simulate traveler<select value={state.voter} onChange={e => setState({ ...state,voter:Number(e.target.value) })} className={`${travelInput} mt-2`}>{DEMO_MEMBERS.map(m => <option key={m.id} value={m.id}>{m.name} · {m.airport}</option>)}</select></label>
    <div aria-live="polite" className="rounded-2xl bg-pistachio p-4 text-sm"><p className="font-bold">{state.status === 'final' ? `Meet in ${airportName(options.find(o => o.id === state.winnerId)!.airport)}!` : state.status === 'vetoed' ? 'Every option was vetoed. Try different shared dates.' : `${active.name}’s sample ballot`}</p><p className="mt-1 text-secondary">{state.status === 'voting' ? `${progress.confirmed} of 3 confirmed.` : 'Voting closed.'}</p></div>
    <DiscoverySummaryNote summary={summary} demo/>
    <ComparisonCards options={visibleOptions} myVotes={state.ballots.filter(b => b.userId === state.voter)} voting={state.status === 'voting'&&!progress.myConfirmed} winnerId={state.winnerId} demo onVote={(id,value) => setState(s => demoVote(s,id,value))} />
    {state.status==='voting'&&<>
      {progress.removedOptionIds.length>0&&<p role="status" className="text-sm text-secondary">{progress.removedOptionIds.length} removed by majority veto.</p>}
      <button type="button" disabled={!progress.canConfirm} className={`${travelButton} w-full`} onClick={()=>setState(s=>demoConfirm(s))}>{progress.myConfirmed?'Votes confirmed':'Confirm my votes'}</button>
    </>}
    <button type="button" className={`${travelQuiet} w-full`} onClick={reset}>Reset demo</button>
    <TravelNotice /><Link href="/travel" className={`${travelButton} w-full`}>Plan a real trip</Link>
  </TravelFrame>;
}
