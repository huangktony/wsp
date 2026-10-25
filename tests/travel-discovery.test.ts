import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultDates, readDates, validateDates, discoveryShortlist, qualifyDestinations, readComparison, discoveryFailure, type DiscoveryTraveler } from '../lib/travel/discovery';
import { fetchFlight } from '../lib/travel/flights';
import type { Candidate, Quote } from '../lib/travel/core';
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
