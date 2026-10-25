import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultDates, readDates, validateDates, discoveryShortlist, qualifyDestinations, readComparison, discoveryFailure, recommendDestinations, type DiscoveryTraveler } from '../lib/travel/discovery';
import { fetchFlight, flightParams } from '../lib/travel/flights';
import { AIRPORTS, US_AIRPORTS, INTERNATIONAL_AIRPORTS, validAirport, validHomeAirport, validateSetup, TravelInputError, FARE_TTL, publicOptions, cheapest, type Option, type Candidate, type Quote } from '../lib/travel/core';
const dates=defaultDates();
const candidates=discoveryShortlist(['ELP','IAH','ORD'],dates);
const members: DiscoveryTraveler[]=['ELP','IAH','ORD'].map((airport,i)=>({id:i+1,name:`Member ${i}`,airport,cap:100,funds:{available:null,checkedAt:Date.now(),source:'unknown'}}));
function quotes(list=candidates, travelers=members, price=50){return new Map(list.flatMap(c=>travelers.map(m=>[`${m.airport}/${c.id}`,{origin:m.airport,destination:c.airport,depart:c.depart,return:c.return,price:m.airport===c.airport?0:price,local:m.airport===c.airport,airlines:[],stops:0,duration:60,quotedAt:new Date().toISOString(),source:'sample'} as Quote] as const)));}
test('shortlist is deterministic, bounded, includes member cities and excludes all-local destinations',()=>{
  assert.equal(candidates.length,6);assert.equal(new Set(candidates.map(c=>c.airport)).size,6);
  assert.deepEqual(discoveryShortlist(['ORD','ELP','IAH'],dates),candidates);
  assert.ok(candidates.some(c=>c.airport==='ELP'));assert.ok(candidates.some(c=>c.airport==='IAH'));
  assert.ok(discoveryShortlist(['AUS','AUS'],dates).every(c=>c.airport!=='AUS'));
  assert.throws(()=>discoveryShortlist(Array(9).fill('AUS'),dates));
});
test('versioned dates and legacy arrays share dates-only normalization, while past finals remain readable',()=>{
  assert.deepEqual(validateDates(dates),dates);
  assert.deepEqual(readDates([{...dates,airport:'SEA',id:3}]),dates);
  const past={version:1,mode:'discover',depart:'2020-01-01',return:'2020-01-03'};
  assert.ok(readDates(past));assert.throws(()=>validateDates(past));
  assert.equal(readDates({...dates,version:99}),null);
  assert.throws(()=>validateDates({...dates,return:dates.depart}));
  assert.throws(()=>validateDates({...dates,return:'2099-01-01'}));
  assert.equal(readComparison([]).discovery,false);
  assert.equal(readComparison({version:2,options:[],summary:{searchedCount:6,qualifiedCount:0,returnedCount:0}}).discovery,true);
});
test('one over-cap traveler rejects a cheap group option before top-three ranking and persistence',()=>{
  const fares=quotes();fares.get(`ELP/${candidates[0].id}`)!.price=101;
  fares.get(`IAH/${candidates[0].id}`)!.price=1;fares.get(`ORD/${candidates[0].id}`)!.price=1;
  const result=qualifyDestinations(candidates,members,fares);
  assert.equal(result.summary.qualifiedCount,5);assert.equal(result.options.length,3);
  assert.ok(result.options.every(o=>o.id!==candidates[0].id));
  assert.ok(result.options.every(o=>o.routes.every(r=>r.check===null)));
  assert.doesNotMatch(JSON.stringify(result),/"cap"|"available"|"funds"/);
  assert.deepEqual(result.options.map(o=>o.id),qualifyDestinations([...candidates].reverse(),members,fares).options.map(o=>o.id));
});
test('known fresh insufficient funds binds; unknown and simulated funds qualify only by cap with caution',()=>{
  const list=[candidates[0]],fares=quotes(list);
  for(const source of ['unknown','simulated'] as const){
    const people=members.map(m=>({...m,funds:{...m.funds,source}}));
    assert.equal(qualifyDestinations(list,people,fares).options[0].routes[0].check,null);
  }
  const people=members.map(m=>({...m,funds:{available:49,checkedAt:Date.now(),source:'nessie-sandbox' as const}}));
  assert.equal(qualifyDestinations(list,people,fares).options.length,0);
});
test('missing routes, all-local and no-fit yield no padded options; fewer than three is honest',()=>{
  const fares=quotes(candidates.slice(0,2));
  assert.equal(qualifyDestinations(candidates,members,fares).options.length,2);
  fares.delete(`ELP/${candidates[0].id}`);
  assert.equal(qualifyDestinations(candidates,members,fares).options.length,1);
  assert.equal(qualifyDestinations(candidates,members,quotes(candidates,members,101)).options.length,0);
  const local: Candidate[]=[{id:1,airport:'ELP',depart:dates.depart,return:dates.return}];
  assert.equal(qualifyDestinations(local,[members[0]],quotes(local,[members[0]])).options.length,0);
});
test('no-key, HTTP failure, timeout and provider error produce safe actionable reasons, not budget advice',async()=>{
  const requests=[async()=>new Response(null,{status:503}),async()=>{throw Error('secret timeout');},async()=>Response.json({search_metadata:{status:'Error'},error:'secret upstream'})];
  const noKey=await fetchFlight('ELP',candidates[0],undefined,'');
  assert.match(discoveryFailure(new Map([['q',noKey]])),/not configured/);
  for(const request of requests){
    const quote=await fetchFlight('ELP',candidates[0],request,'fake');
    assert.equal(quote.failure,'provider');const message=discoveryFailure(new Map([['q',quote]]));
    assert.match(message,/provider unavailable/);assert.doesNotMatch(message,/budget|secret/);
  }
});


test('geographic shortlist adapts to coasts rather than always spending calls on Austin and Denver', () => {
  const west = discoveryShortlist(['SEA','PDX','SFO'],dates).map(c=>c.airport);
  const east = discoveryShortlist(['BOS','JFK','PHL'],dates).map(c=>c.airport);
  assert.notDeepEqual(west,east);
  assert.ok(west.includes('PDX') && west.includes('SEA'));
  assert.ok(east.includes('JFK') && east.includes('PHL'));
  assert.ok(!west.includes('AUS') && !east.includes('AUS'));
  assert.deepEqual(discoveryShortlist(['PHL','BOS','JFK'],dates).map(c=>c.airport),east);
  assert.equal(discoveryShortlist(Array(8).fill('SEA'),dates).length,6);
});

function recommendationOption(id: number, prices: number[], minutes: number, stops = 0): Option {
  return { id, airport:['AUS','DEN','LAS','SEA'][id-1],depart:dates.depart,return:dates.return,total:prices.reduce((a,b)=>a+b,0),complete:true,
    routes:prices.map((price,i)=>({ origin:members[i].airport,destination:['AUS','DEN','LAS','SEA'][id-1],depart:dates.depart,return:dates.return,price,local:false,airlines:[],stops,duration:minutes,quotedAt:new Date().toISOString(),source:'sample',userId:i+1,name:'Friend',check:null,checkSource:'unknown' })) };
}
test('recommendations choose distinct cost, outbound ease and balanced cost tradeoffs truthfully', () => {
  const cheapestOption = recommendationOption(1,[5,195],300,1);
  const easiest = recommendationOption(2,[250,250],90);
  const balanced = recommendationOption(3,[110,110],180);
  const options = recommendDestinations([easiest,balanced,cheapestOption]);
  assert.deepEqual(options.map(o=>o.id),[1,2,3]);
  assert.deepEqual(options.map(o=>o.recommendation?.kind),['lowest-cost','easiest-travel','balanced']);
  assert.match(options[1].recommendation!.reason,/outbound/);
  assert.equal(cheapest(options),1,'ease must not claim an expensive option has the lowest cost');
  assert.deepEqual(recommendDestinations([cheapestOption,easiest,balanced]),options);
  const exposed=publicOptions(options.map(o=>({...o,recommendation:{...o.recommendation!,privateCap:999}})),new Date().toISOString());
  assert.equal(exposed[1].recommendation?.kind,'easiest-travel');
  assert.doesNotMatch(JSON.stringify(exposed),/privateCap/);
});
test('missing itinerary metrics never produce an easiest-travel claim; a single option is not duplicated', () => {
  const options=[recommendationOption(1,[50,50],100),recommendationOption(2,[60,60],90),recommendationOption(3,[70,70],80)];
  options[0].routes[0].duration=null;
  const results=recommendDestinations(options);
  assert.equal(results.length,3);
  assert.ok(results.every(o=>o.recommendation?.kind!=='easiest-travel'));
  assert.equal(recommendDestinations([options[0]]).length,1);
});
test('expired real provider fares never qualify even when every cap fits', () => {
  const list=[candidates[0]], fares=quotes(list);
  for (const quote of fares.values()) { quote.source='serpapi'; quote.quotedAt=new Date(Date.now()-FARE_TTL-1).toISOString(); }
  assert.equal(qualifyDestinations(list,members,fares).options.length,0);
});


test('finding new destinations excludes prior airports and exhausts without recycling rejected choices', () => {
  const origins=['ELP','IAH','ORD'];
  const first=discoveryShortlist(origins,dates);
  const excluded=first.map(option=>option.airport);
  const second=discoveryShortlist(origins,dates,excluded);
  assert.equal(second.length,6);
  assert.ok(second.every(option=>!excluded.includes(option.airport)));
  assert.ok(!second.some(option=>['ELP','IAH'].includes(option.airport)), 'member-city reserve also respects exclusions');
  assert.deepEqual(discoveryShortlist(origins,dates,[...excluded,'XXX','AUS<script>']),second,'unknown airport exclusions are safely ignored');
  const almostAll=AIRPORTS.map(([code])=>code).filter(code=>code!=='SEA');
  assert.deepEqual(discoveryShortlist(origins,dates,almostAll).map(option=>option.airport),['SEA']);
  assert.deepEqual(discoveryShortlist(origins,dates,AIRPORTS.map(([code])=>code)),[]);
  const seen=new Set<string>();
  for(let round=0;round<8;round++) {
    const next=discoveryShortlist(origins,dates,[...seen]);
    assert.ok(next.length<=6);
    for(const option of next) { assert.equal(seen.has(option.airport),false);seen.add(option.airport); }
  }
  assert.equal(seen.size,US_AIRPORTS.length,'National never recycles and covers every US airport');
});

const region=(code:string)=>AIRPORTS.find(a=>a[0]===code)![2];
const usCode=(code:string)=>US_AIRPORTS.some(a=>a[0]===code);
const scoped=(scope:'state'|'national'|'global')=>({...dates,scope});

test('every airport has a region and a country, and every one has coordinates so it can be ranked',()=>{
  for(const [code,city,reg,country] of AIRPORTS) { assert.ok(code&&city&&reg&&country,code);assert.equal(code.length,3); }
  assert.equal(new Set(AIRPORTS.map(a=>a[0])).size,AIRPORTS.length,'no duplicate codes');
  for(const code of ['SAT','HOU','DAL','OAK','SJC','SMF','BUR','FLL','TPA','LGA']) assert.ok(usCode(code),code);
  for(const code of ['CUN','MEX','YYZ','YVR','LHR','CDG','FCO','BCN','HND','ICN','SJO','PVR']) assert.ok(INTERNATIONAL_AIRPORTS.some(a=>a[0]===code),code);
  assert.equal(INTERNATIONAL_AIRPORTS.length,12);
  for(const scope of ['national','global'] as const) for(const origin of ['ELP','ORD']) for(const c of discoveryShortlist([origin,'SEA'],scoped(scope))) assert.ok(Number.isFinite(c.id)&&c.airport);
});
test('state scope returns only airports in a traveler\'s home state',()=>{
  const list=discoveryShortlist(['ELP','IAH','ORD'],scoped('state')).map(c=>c.airport);
  assert.ok(list.length>0&&list.length<=6);
  assert.ok(list.every(code=>usCode(code)&&['TX','IL'].includes(region(code))),list.join());
  assert.ok(list.includes('AUS')&&list.includes('DFW'),'Texas and Illinois destinations are in the pool');
  const txOnly=discoveryShortlist(['ELP','IAH'],scoped('state')).map(c=>c.airport);
  assert.ok(txOnly.every(code=>region(code)==='TX'),txOnly.join());
  assert.ok(!txOnly.includes('ORD')&&!txOnly.includes('DEN'));
  const nw=discoveryShortlist(['SEA','PDX'],scoped('state')).map(c=>c.airport).sort();
  assert.deepEqual(nw,['PDX','SEA'],'Washington and Oregon only have these two in the supported list');
  assert.ok(discoveryShortlist(['SEA','PDX'],scoped('national')).some(c=>!['PDX','SEA'].includes(c.airport)),'National reaches further, so the state filter is doing the work');
  const ca=discoveryShortlist(['SFO','LAX'],scoped('state')).map(c=>c.airport);
  assert.ok(ca.length===6&&ca.every(code=>region(code)==='CA'),ca.join());
});
test('state scope with nothing beyond everyone\'s own airport says so and points to National',()=>{
  assert.throws(()=>discoveryShortlist(['DEN','DEN'],scoped('state')),e=>e instanceof TravelInputError&&e.message==='Not enough airports in your state. Try National.');
  assert.throws(()=>discoveryShortlist(['SLC'],scoped('state')),/Try National/);
  assert.ok(discoveryShortlist(['DEN','DEN'],scoped('national')).length>0);
});
test('global scope returns only international airports, capped at six, and never a home city',()=>{
  const list=discoveryShortlist(['ELP','IAH','ORD'],scoped('global')).map(c=>c.airport);
  assert.equal(list.length,6);assert.ok(list.every(code=>INTERNATIONAL_AIRPORTS.some(a=>a[0]===code)),list.join());
});
test('national is every US airport and no international one',()=>{
  const list=discoveryShortlist(['ELP','IAH','ORD'],scoped('national')).map(c=>c.airport);
  assert.ok(list.every(usCode));assert.deepEqual(list,candidates.map(c=>c.airport));
});
test('a trip saved without scope behaves as National',()=>{
  const legacy={version:1,mode:'discover',depart:dates.depart,return:dates.return};
  assert.equal(readDates(legacy)!.scope,'national');
  assert.equal(readDates([{airport:'AUS',depart:dates.depart,return:dates.return}])!.scope,'national','old candidate arrays too');
  assert.deepEqual(discoveryShortlist(['ELP','IAH','ORD'],readDates(legacy)!),candidates);
  assert.equal(validateDates(legacy).scope,'national');
});
test('scope is kept when valid and rejected when unknown',()=>{
  for(const scope of ['state','national','global'] as const) assert.equal(readDates({...dates,scope})!.scope,scope);
  for(const bad of ['galaxy','',null,1,'GLOBAL']) assert.equal(readDates({...dates,scope:bad}),null,String(bad));
  assert.equal(defaultDates().scope,'national');
});
test('home airports stay US only, destinations can be international, and flight lookups accept both',()=>{
  assert.equal(validAirport('CUN'),true);assert.equal(validHomeAirport('CUN'),false);assert.equal(validHomeAirport('AUS'),true);
  assert.throws(()=>validateSetup({airport:'CUN',budget:200}),/supported US list/);
  assert.equal(validateSetup({airport:'AUS',budget:200}).airport,'AUS');
  assert.throws(()=>discoveryShortlist(['CUN'],dates),/home airport/);
  const p=flightParams('AUS',{id:1,airport:'CUN',depart:'2027-03-10',return:'2027-03-14'});
  assert.equal(p.arrival_id,'CUN');assert.equal(p.departure_id,'AUS');assert.equal(p.currency,'USD');
  assert.throws(()=>flightParams('AUS',{id:1,airport:'XXX',depart:'2027-03-10',return:'2027-03-14'}),/Unsupported/);
});
