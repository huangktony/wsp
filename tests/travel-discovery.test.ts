import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultDates, readDates, validateDates, discoveryShortlist, qualifyDestinations, readComparison, discoveryFailure, recommendDestinations, type DiscoveryTraveler } from '../lib/travel/discovery';
import { fetchFlight } from '../lib/travel/flights';
import { AIRPORTS, FARE_TTL, publicOptions, cheapest, type Option, type Candidate, type Quote } from '../lib/travel/core';
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
  for(let round=0;round<5;round++) {
    const next=discoveryShortlist(origins,dates,[...seen]);
    assert.ok(next.length<=6);
    for(const option of next) { assert.equal(seen.has(option.airport),false);seen.add(option.airport); }
  }
  assert.equal(seen.size,AIRPORTS.length);
});
