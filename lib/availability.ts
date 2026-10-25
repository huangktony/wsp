/** Group availability uses America/Chicago wall time on both browser and server. */
export const AVAILABILITY_ZONE = 'America/Chicago';
export const BLOCKS = ['morning', 'afternoon', 'evening', 'late-night'] as const;
export type Block = typeof BLOCKS[number];
export const BLOCK_LABEL: Record<Block, string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', 'late-night': 'Late night' };
export const BLOCK_HOURS: Record<Block, number> = { morning: 9, afternoon: 12, evening: 17, 'late-night': 21 };
export const BLOCK_RANGE: Record<Block, string> = { morning: '9am–12pm', afternoon: '12–5pm', evening: '5–9pm', 'late-night': '9pm+' };
export const dateKey = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: AVAILABILITY_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
export const dateObject = (date: string) => new Date(`${date}T12:00:00Z`);
export const addDays = (date: string, n: number) => { const d = dateObject(date); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export type TimeRange = { start: number; end: number };
export const BLOCK_MINUTES: Record<Block, TimeRange> = { morning: { start:540,end:720 }, afternoon:{ start:720,end:1020 }, evening:{ start:1020,end:1260 }, 'late-night':{ start:1260,end:1440 } };
export const timeText = (minute: number) => `${Math.floor(minute / 60) % 12 || 12}:${String(minute % 60).padStart(2,'0')} ${minute % 1440 < 720 ? 'AM' : 'PM'}`;
export const rangeText = (range: TimeRange) => `${timeText(range.start)} – ${timeText(range.end)}`;
export const blockForMinute = (minute: number): Block => minute < 720 ? 'morning' : minute < 1020 ? 'afternoon' : minute < 1260 ? 'evening' : 'late-night';
export const rangeSlot = (date: string, range: TimeRange, planStart?: number) => `${date} ${range.start}-${range.end}${planStart == null ? '' : `@${planStart}`}`;
export function parseAvailability(slot: string) {
  const m = /^(\d{4}-\d{2}-\d{2}) (?:(morning|afternoon|evening|late-night)|(\d{1,4})-(\d{1,4})(?:@(\d{1,4}))?)$/.exec(slot);
  if (!m || !Number.isFinite(dateObject(m[1]).getTime()) || dateObject(m[1]).toISOString().slice(0,10) !== m[1]) return null;
  const { start, end } = m[2] ? BLOCK_MINUTES[m[2] as Block] : { start:Number(m[3]),end:Number(m[4]) };
  const planStart = m[5] == null ? start : Number(m[5]);
  if (start < 0 || end > 1440 || end-start < 60 || start % 30 || end % 30 || planStart < start || planStart >= end || planStart % 30) return null;
  return { date:m[1],start,end,planStart,block:blockForMinute(planStart) };
}
/** Convert a Central Time wall-clock minute (including next midnight) to an instant. */
export function minuteStamp(date: string, minute: number) {
  const desired = Date.parse(`${date}T00:00:00Z`) + minute * 60000;
  let stamp = desired;
  for (let i=0;i<2;i++) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: AVAILABILITY_ZONE, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23' }).formatToParts(new Date(stamp));
    const p = Object.fromEntries(parts.map(x => [x.type,x.value]));
    stamp += desired - Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
  }
  return stamp;
}
export function slotStart(slot: string) { const p=parseAvailability(slot); return p ? minuteStamp(p.date,p.planStart) : NaN; }
export function earliestStart(date: string, now = new Date()) {
  if (date > dateKey(now)) return 0;
  if (date < dateKey(now)) return 1440;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:AVAILABILITY_ZONE,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
  return Math.min(1440,Math.ceil((Number(parts.hour)*60+Number(parts.minute)+(Number(parts.second) || now.getMilliseconds() ? 0.01 : 0))/30)*30);
}
export function clampRange(range: TimeRange, minimum = 0): TimeRange | null {
  minimum = Math.ceil(minimum/30)*30;
  if (minimum > 1380) return null;
  const start = Math.max(minimum,Math.min(1380,Math.round(range.start/30)*30));
  return { start, end:Math.max(start+60,Math.min(1440,Math.round(range.end/30)*30)) };
}
export function moveRangeHandle(range: TimeRange, handle: 'start' | 'end', minute: number, minimum = 0): TimeRange {
  const snap = Math.round(minute/30)*30;
  return handle === 'start' ? { ...range,start:Math.max(minimum,Math.min(range.end-60,snap)) } : { ...range,end:Math.max(range.start+60,Math.min(1440,snap)) };
}
export function rangeKey(range: TimeRange, handle: 'start' | 'end', key: string, minimum = 0) {
  const step = ({ ArrowLeft:-30,ArrowDown:-30,ArrowRight:30,ArrowUp:30 } as Record<string,number>)[key];
  return step ? moveRangeHandle(range,handle,range[handle]+step,minimum) : range;
}
export function selectableDay(date: string, now = new Date()) { return date >= dateKey(now) && date <= addDays(dateKey(now), 30); }
export function futureSlot(slot: string, now = new Date()) { const p=parseAvailability(slot); return !!p && minuteStamp(p.date,p.end)>now.getTime(); }
export function normalizeAvailability(values: readonly string[] | null | undefined, now = new Date()): string[] {
  const ranges: {date:string;start:number;end:number}[]=[];
  for (const value of values ?? []) {
    let p=parseAvailability(value);
    if (!p) {
      const old=/^(sun|mon|tue|wed|thu|fri|sat)(?:day)?\s+(morning|afternoon|evening|late(?: night)?)$/i.exec(value);
      if (!old) continue;
      const day=['sun','mon','tue','wed','thu','fri','sat'].indexOf(old[1].toLowerCase());
      const block=(old[2].toLowerCase().startsWith('late')?'late-night':old[2].toLowerCase()) as Block;
      let date=addDays(dateKey(now),(day-dateObject(dateKey(now)).getUTCDay()+7)%7);
      if (!futureSlot(`${date} ${block}`,now)) date=addDays(date,7);
      p=parseAvailability(`${date} ${block}`);
    }
    if (!p || !futureSlot(rangeSlot(p.date,p),now)) continue;
    // Keep saved boundaries stable for redraw comparisons. Search/UI clip today's
    // elapsed portion separately, without writing to the database on reads.
    ranges.push(p);
  }
  ranges.sort((a,b)=>a.date.localeCompare(b.date)||a.start-b.start);
  const merged: typeof ranges=[];
  for (const range of ranges) {
    const last=merged[merged.length-1];
    if (last?.date===range.date && range.start<=last.end) last.end=Math.max(last.end,range.end);
    else merged.push({...range});
  }
  return merged.map(r=>rangeSlot(r.date,r));
}
/** For edited/saved forms, elapsed minutes cannot be offered as new availability. */
export function editableAvailability(values: readonly string[], now = new Date()) {
  return normalizeAvailability(values,now).flatMap(s=>{
    const p=parseAvailability(s)!; const start=Math.max(p.start,earliestStart(p.date,now));
    return p.end-start>=60 ? [rangeSlot(p.date,{start,end:p.end})] : [];
  });
}
export const shortDate = (date:string) => dateObject(date).toLocaleDateString('en-US',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric'});
export function availabilityLabel(slot: string) { const p=parseAvailability(slot); return p ? `${shortDate(p.date)} · ${timeText(p.planStart)}` : slot; }
export function availabilityRangeLabel(slot: string) { const p=parseAvailability(slot); return p ? `${shortDate(p.date)} · ${rangeText(p)}` : slot; }
export type TimeMember = { user_id?: number; name?: string; availability: string[]; included?: boolean };
export type TimeMatch = { slot: string; free: number; total: number; unavailable: { id?: number; name: string }[]; date?: string; window?: TimeRange; planStart?: number; available?: {id?:number;name:string}[] };
export function chooseTime(members: TimeMember[], now = new Date()): TimeMatch | null {
  const ready=members.filter(m=>m.included!==false).map(m=>({...m,ranges:normalizeAvailability(m.availability,now).map(s=>parseAvailability(s)!)})).filter(m=>m.ranges.length);
  const dates=[...new Set(ready.flatMap(m=>m.ranges.map(r=>r.date)))];
  const candidates: TimeMatch[]=[];
  const identity=(m:TimeMember)=>({id:m.user_id,name:m.name??'A member'});
  for (const date of dates) {
    const minimum=earliestStart(date,now);
    const endpoints=[...new Set(ready.flatMap(m=>m.ranges.filter(r=>r.date===date&&r.end>minimum).flatMap(r=>[Math.max(r.start,minimum),r.end])))].sort((a,b)=>a-b);
    for (const start of endpoints) for (const end of endpoints) {
      if (end-start<120) continue;
      const free=ready.filter(m=>m.ranges.some(r=>r.date===date&&r.start<=start&&r.end>=end));
      if (!free.length) continue;
      const planStart=Math.ceil((end>540?Math.max(start,540):start)/30)*30;
      if (planStart>=end) continue;
      candidates.push({slot:rangeSlot(date,{start,end},planStart),date,window:{start,end},planStart,free:free.length,total:ready.length,available:free.map(identity),unavailable:ready.filter(m=>!free.includes(m)).map(identity)});
    }
  }
  const weekendEvening=(m:TimeMatch)=>[0,5,6].includes(dateObject(m.date!).getUTCDay())&&m.window!.start<1320&&m.window!.end>1020;
  candidates.sort((a,b)=>b.free-a.free || (b.window!.end-b.window!.start)-(a.window!.end-a.window!.start) || Number(weekendEvening(b))-Number(weekendEvening(a)) || Number(slotStart(a.slot)<now.getTime()+86400000)-Number(slotStart(b.slot)<now.getTime()+86400000) || slotStart(a.slot)-slotStart(b.slot));
  return candidates[0]??null;
}
export function timeNotice(match?: TimeMatch | null) {
  if (!match || match.free===match.total) return '';
  return `Best time: ${availabilityLabel(match.slot).replace(' · ', ', ')}. ${match.free} of ${match.total} free. ${match.unavailable.map(m=>m.name).join(', ')} ${match.unavailable.length===1?"isn't":"aren't"} free then.`;
}
export function snapshotTime(settings: (TimeMember & {time_match?:TimeMatch})[], previous?: {slot?:string;search_settings?:TimeMember[]}|null, now=new Date()) {
  const signature=(m:TimeMember[])=>JSON.stringify(m.map(x=>[x.user_id,normalizeAvailability(x.availability,now)]).sort((a,b)=>Number(a[0])-Number(b[0])));
  const saved=(previous?.search_settings?.[0] as {time_match?:TimeMatch}|undefined)?.time_match;
  const match=saved?.window && slotStart(saved.slot)>=now.getTime() && signature(settings)===signature(previous!.search_settings!) ? saved : chooseTime(settings,now);
  if (match&&settings.length) settings[0].time_match=match;
  return match;
}
