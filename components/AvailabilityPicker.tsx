'use client';
import { useEffect, useRef, useState } from 'react';
import { AvailabilityRange } from './AvailabilityRange';
import { addDays, availabilityRangeLabel, BLOCK_MINUTES, dateKey, dateObject, futureSlot, normalizeAvailability, selectableDay, parseAvailability, rangeSlot, earliestStart, clampRange, rangeText, type TimeRange } from '@/lib/availability';
export type AvailabilityDraft = Record<string, TimeRange[]>;
export const availabilityDraft = (slots: string[], now = new Date()): AvailabilityDraft => slots.reduce((out,s)=>{
  const p=parseAvailability(s); if(p) { const start=Math.max(p.start,earliestStart(p.date,now)); if(p.end-start>=60) (out[p.date]??=[]).push({start,end:p.end}); } return out;
},{} as AvailabilityDraft);
export const draftReady = (draft: AvailabilityDraft) => Object.values(draft).every(ranges=>ranges.length>0&&ranges.every(r=>r.end-r.start>=60));
export const draftSlots = (draft: AvailabilityDraft) => Object.entries(draft).flatMap(([date,ranges])=>ranges.map(r=>rangeSlot(date,r)));
export function AvailabilityPicker({ value, onChange }: { value: string[]; onChange: (slots: string[]) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AvailabilityDraft>({});
  const [month, setMonth] = useState(dateKey().slice(0,7));
  const [now, setNow] = useState(new Date());
  const dates = Object.keys(draft).sort();
  const close = () => { setOpen(false); dialog.current?.close(); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    const targets = [document.body, document.querySelector<HTMLElement>('.phone-screen')].filter((x): x is HTMLElement => !!x);
    const overflow = targets.map(el => el.style.overflow);
    targets.forEach(el => { el.style.overflow = 'hidden'; });
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const tick = setInterval(() => setNow(new Date()), 30000);
    return () => { clearInterval(tick); targets.forEach((el, i) => { el.style.overflow = overflow[i]; }); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    setDraft(current => Object.fromEntries(Object.entries(current).map(([date,ranges])=>[date,ranges.map(r=>({...r,start:Math.max(r.start,earliestStart(date,now))})).filter(r=>r.end-r.start>=60)])));
  }, [open, now]);
  const first = dateObject(`${month}-01`);
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth()+1, 0)).getUTCDate();
  const moveMonth = (delta: number) => { const d = dateObject(`${month}-01`); d.setUTCMonth(d.getUTCMonth()+delta); setMonth(d.toISOString().slice(0,7)); };
  const toggleDay = (date: string) => {
    if (!selectableDay(date, now)) return;
    setDraft(current => { const next = { ...current }; if (date in next) delete next[date]; else { const range=clampRange(BLOCK_MINUTES.evening,earliestStart(date,now)); next[date]=range?[range]:[]; } return next; });
  };
  const apply = () => { if (!draftReady(draft)) return; onChange(normalizeAvailability(draftSlots(draft), new Date())); close(); };
  const valid = draftReady(draft) && draftSlots(draft).every(s => futureSlot(s, now) && parseAvailability(s)!.start >= earliestStart(parseAvailability(s)!.date,now));
  return <>
    <div className="flex flex-wrap gap-2">
      {normalizeAvailability(value).map(slot => <span key={slot} className="inline-flex items-center gap-2 rounded-full bg-[#8FB78F] px-3 py-2 text-sm font-semibold text-[#1B3A1E]">{availabilityRangeLabel(slot)}<button type="button" aria-label={`Remove ${availabilityRangeLabel(slot)}`} onClick={() => onChange(normalizeAvailability(value).filter(s => s !== slot))}>×</button></span>)}
    </div>
    {!!value.length && <p className="mt-2 text-sm text-muted">{new Set(value.map(s => s.split(' ')[0])).size} days · {value.length} times</p>}
    <button ref={trigger} type="button" className="mt-2 flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-[#6F98A2] bg-white font-semibold" style={{ fontFamily: 'inherit' }} onClick={() => { const current = new Date(); setNow(current); setDraft(availabilityDraft(normalizeAvailability(value, current))); setMonth(dateKey(current).slice(0,7)); setOpen(true); }}>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 11h18"/></svg>{value.length ? 'Edit availability' : 'Add availability'}
    </button>
    <dialog ref={dialog} className="availability-dialog text-[#28536B]" aria-modal="true" role="dialog" aria-labelledby="availability-title" onCancel={e => { e.preventDefault(); close(); }} onClick={e => { if (e.target === dialog.current) close(); }} onKeyDown={e => {
      if (e.key !== 'Tab') return;
      const buttons = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]') ?? []);
      const first = buttons[0], last = buttons[buttons.length-1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }}>
      <div className="flex max-h-[90svh] flex-col" onClick={e => e.stopPropagation()}>
        <div className="overflow-y-auto p-5">
          <header className="mb-4 flex items-center justify-between"><h2 id="availability-title" className="text-xl font-extrabold">When are you free?</h2><button type="button" className="h-11 w-11 text-2xl" aria-label="Close availability" onClick={close}>×</button></header>
          <div className="mb-3 flex items-center justify-between"><button type="button" aria-label="Previous month" className="h-11 w-11 text-2xl" disabled={month <= dateKey(now).slice(0,7)} onClick={() => moveMonth(-1)}>‹</button><span className="font-bold" aria-live="polite">{first.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' })}</span><button type="button" aria-label="Next month" className="h-11 w-11 text-2xl" disabled={month >= addDays(dateKey(now),30).slice(0,7)} onClick={() => moveMonth(1)}>›</button></div>
          <p className="mb-3 text-xs text-[#35607A]">Times shown in Central Time.</p>
          <div className="grid grid-cols-7 gap-1">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <span key={d} className="text-center text-xs font-bold">{d}</span>)}
            {Array.from({ length: first.getUTCDay() }, (_, i) => <span key={`empty-${i}`} />)}
            {Array.from({ length: days }, (_, i) => {
              const date = `${month}-${String(i+1).padStart(2,'0')}`, selected = date in draft;
              return <button key={date} type="button" data-date={date} disabled={!selectableDay(date, now)} aria-pressed={selected} aria-label={`${dateObject(date).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' })}${selected ? ', selected' : ''}`} className={`relative h-10 rounded-full text-sm disabled:text-gray-400 ${selected ? 'bg-[#8FB78F] text-[#1B3A1E]' : ''} ${date === dateKey(now) ? 'ring-2 ring-inset ring-[#28536B]' : ''}`} onClick={() => toggleDay(date)} onKeyDown={e => {
                const offset = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string,number>)[e.key];
                if (!offset) return; e.preventDefault(); const next = addDays(date,offset); if (!selectableDay(next,now)) return; setMonth(next.slice(0,7)); requestAnimationFrame(() => dialog.current?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus());
              }}>{i+1}{!!draft[date]?.length && <span aria-hidden="true" className="absolute bottom-1 left-1/2 h-1 w-1 rounded-full bg-[#28536B]" />}</button>;
            })}
          </div>
          {!!dates.length && <section className="mt-5"><h3 className="font-bold">Times</h3><button type="button" className="my-2 text-sm underline" onClick={() => setDraft(Object.fromEntries(dates.map(d => [d, draft[dates[0]]?.[0] ? [clampRange(draft[dates[0]][0],earliestStart(d,now))].filter((r): r is TimeRange => !!r) : []])))}>Same times for every day</button>
            {dates.map(date => <div key={date} className="mb-4">
              <p className="mb-2 text-sm font-bold">{dateObject(date).toLocaleDateString('en-US',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric'})}</p>
              {draft[date][0] && <AvailabilityRange value={draft[date][0]} minimum={earliestStart(date,now)} label={date} onChange={range=>setDraft(current=>({...current,[date]:[range]}))} />}
              {draft[date].length>1 && <p className="mb-2 text-xs text-[#35607A]">Also saved: {draft[date].slice(1).map(rangeText).join(', ')}. Editing this day's slider replaces these times.</p>}
              <div className="flex flex-wrap gap-2">{Object.entries({Morning:BLOCK_MINUTES.morning,Afternoon:BLOCK_MINUTES.afternoon,Evening:BLOCK_MINUTES.evening,'All day':{start:0,end:1440}}).map(([label,range])=><button key={label} type="button" disabled={range.end-earliestStart(date,now)<60} className="rounded-full border border-[#B4CCCF] px-3 py-2 text-xs font-semibold disabled:opacity-40" onClick={()=>{const next=clampRange(range,earliestStart(date,now));setDraft(current=>({...current,[date]:next?[next]:[]}));}}>{label}</button>)}</div>
              {(!draft[date].length || draft[date].some(r=>r.start<earliestStart(date,now))) && <p className="mt-1 text-xs text-[#7A1A3F]">Choose a future range of at least one hour.</p>}
            </div>)}
          </section>}
        </div>
        <footer className="sticky bottom-0 flex gap-3 border-t border-[#B4CCCF] bg-white p-4"><button type="button" className="h-12 flex-1 rounded-2xl border border-[#6F98A2] font-bold" onClick={close}>Cancel</button><button type="button" disabled={!valid} className="h-12 flex-1 rounded-2xl bg-[#8FB78F] font-bold text-[#1B3A1E] disabled:opacity-40" onClick={apply}>Done</button></footer>
      </div>
    </dialog>
    <style>{`.availability-dialog { position:fixed; inset:auto 0 0; margin:0 auto; padding:0; border:0; width:min(100%,390px); max-width:390px; max-height:90svh; border-radius:24px 24px 0 0; background:white; font-family:inherit; z-index:1000; } .availability-dialog * { font-family:inherit; } .availability-dialog::backdrop { background:rgba(40,83,107,.4); } @media(min-width:640px) { .availability-dialog { inset:0; margin:auto; border-radius:24px; } }`}</style>
  </>;
}
