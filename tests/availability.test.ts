import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, chooseTime, dateKey, normalizeAvailability, selectableDay, slotStart, snapshotTime, timeNotice, earliestStart, moveRangeHandle, rangeKey, clampRange, availabilityLabel, availabilityRangeLabel, type TimeMember, type TimeMatch } from '../lib/availability';
import { MeBody } from '../lib/comfort';
import { roundSettings } from '../lib/roundSettings';
import { slotDate, stopTimes } from '../lib/slot';
const now=new Date('2026-10-22T15:10:00Z'); // Thursday 10:10am Central
const fri='2026-10-23', sat='2026-10-24';
const member=(id:number,availability:string[],name=`Member ${id}`):TimeMember=>({user_id:id,name,availability});
test('overlap counts members once, selects the intersection and names those not free',()=>{
 const match=chooseTime([member(1,[`${fri} 1020-1380`]),member(2,[`${fri} 1080-1260`,`${fri} 1080-1260`]),member(3,[`${fri} 1050-1320`]),member(4,[`${sat} evening`],'Maya')],now)!;
 assert.deepEqual(match.window,{start:1080,end:1260}); assert.equal(match.planStart,1080); assert.equal(match.free,3); assert.equal(match.total,4);
 assert.deepEqual(match.available?.map(m=>m.id),[1,2,3]);
 assert.equal(timeNotice(match),"Best time: Fri, Oct 23, 6:00 PM. 3 of 4 free. Maya isn't free then.");
 assert.equal(availabilityLabel(match.slot),'Fri, Oct 23 · 6:00 PM');
 assert.equal(availabilityRangeLabel(`${fri} 1020-1290`),'Fri, Oct 23 · 5:00 PM – 9:30 PM');
});
test('two-hour minimum applies to the full overlap, not short high-attendance segments',()=>{
 assert.equal(chooseTime([member(1,[`${fri} 1020-1110`])],now),null);
 const match=chooseTime([member(1,[`${fri} 1020-1260`]),member(2,[`${fri} 1080-1140`])],now)!;
 assert.equal(match.free,1); assert.deepEqual(match.window,{start:1020,end:1260});
 assert.equal(chooseTime([member(1,[`${fri} 1020-1140`])],now)?.free,1);
});
test('ties prioritize attendance, longer windows, weekend evening, then 24-hour lead time and earliest date',()=>{
 assert.equal(chooseTime([member(1,[`${fri} 540-720`,`${sat} 0-1440`]),member(2,[`${fri} 540-720`])],now)?.date,fri);
 assert.equal(chooseTime([member(1,[`${fri} evening`,'2026-10-25 afternoon'])],now)?.date,'2026-10-25');
 assert.equal(chooseTime([member(1,[`${fri} 540-780`,`${sat} evening`])],now)?.date,sat);
 assert.equal(chooseTime([member(1,['2026-10-22 720-900',`${fri} 720-900`,`${sat} 720-900`])],now)?.date,fri);
 assert.equal(chooseTime([member(1,[`${sat} evening`,`${fri} evening`])],now)?.date,fri);
});
test('all-day ranges start plans at 9 AM; midnight ends stay on the next date',()=>{
 const match=chooseTime([member(1,[`${fri} 0-1440`])],now)!;
 assert.deepEqual(match.window,{start:0,end:1440}); assert.equal(match.planStart,540);
 assert.equal(slotDate(match.slot).end.toISOString(),'2026-10-24T05:00:00.000Z');
 assert.equal(stopTimes(match.slot,1)[0],'9:00 AM');
 assert.equal(chooseTime([member(1,[`${fri} 1260-1440`])],now)?.planStart,1260);
});
test('today clips at the next half hour; elapsed ranges drop and invalidate setup',()=>{
 assert.equal(earliestStart('2026-10-22',now),630);
 assert.equal(earliestStart('2026-10-22',new Date('2026-10-22T15:30:01Z')),660);
 const match=chooseTime([member(1,['2026-10-22 0-1440'])],now)!;
 assert.equal(match.planStart,630); assert.equal(match.window?.start,630);
 assert.deepEqual(normalizeAvailability(['2026-10-22 0-600','2026-10-21 evening'],now),[]);
 assert.equal(MeBody.safeParse({availability:['2000-01-01 evening'],interests:[],max_distance_mi:5}).success,false);
 assert.equal(roundSettings([{user_id:1,availability:['2000-01-01 evening'],interests:[],max_distance_mi:5,comfort_tier:null,budget_tier:null}])[0].included,false);
 assert.equal(selectableDay(addDays(dateKey(now),30),now),true);
 assert.equal(selectableDay(addDays(dateKey(now),31),now),false);
});
test('old blocks and weekday names convert, merge adjacent ranges, and preserve gaps',()=>{
 assert.deepEqual(normalizeAvailability(['Fri Evening',`${sat} morning`,`${sat} afternoon`,`${sat} late-night`],now),[`${fri} 1020-1260`,`${sat} 540-1020`,`${sat} 1260-1440`]);
 assert.deepEqual(normalizeAvailability([`${fri} morning`,`${fri} evening`],now),[`${fri} 540-720`,`${fri} 1020-1260`]);
});
test('redraw keeps the snapshot until availability changes',()=>{
 const initial:(TimeMember&{time_match?:TimeMatch})[]=[member(1,[`${fri} evening`,`${sat} evening`])];
 const first=snapshotTime(initial,null,now)!;
 assert.deepEqual(snapshotTime([member(1,[`${fri} evening`,`${sat} evening`])],{search_settings:initial},new Date('2026-10-23T00:00:00Z')),first);
 assert.equal(snapshotTime([member(1,[`${sat} evening`])],{search_settings:initial},now)?.date,sat);
});
test('range dragging snaps, clamps and enforces one hour; arrows step 30 minutes',()=>{
 const range={start:1020,end:1260};
 assert.deepEqual(moveRangeHandle(range,'start',1061),{start:1050,end:1260});
 assert.equal(moveRangeHandle(range,'start',1440).start,1200);
 assert.equal(moveRangeHandle(range,'end',0).end,1080);
 assert.equal(moveRangeHandle(range,'end',1600).end,1440);
 assert.equal(moveRangeHandle(range,'start',0,630).start,630);
 assert.equal(rangeKey(range,'start','ArrowRight').start,1050);
 assert.equal(rangeKey(range,'end','ArrowDown').end,1230);
 assert.equal(rangeKey(range,'end','Escape'),range);
 assert.deepEqual(clampRange({start:1020,end:1260},1320),{start:1320,end:1380});
 assert.equal(clampRange(range,1410),null);
});
test('Central Time conversion respects DST and exact selected starts',()=>{
 assert.equal(slotDate('2026-11-01 1020-1440@1050').start.toISOString(),'2026-11-01T23:30:00.000Z');
 assert.equal(new Date(slotStart('2026-10-25 evening')).toISOString(),'2026-10-25T22:00:00.000Z');
});
