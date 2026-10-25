import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCandidates, validateSetup, validDay, defaultCandidates, optionWithTotals, publicOptions, cheapest, winner, toggleBallot, ballotComplete, CHECK_TTL, type Route, type Ballot } from '../lib/travel/core';
import { availableFunds, budgetCheck } from '../lib/travel/finance';
import { normalizeFlight, fetchFlight, compareFlights, flightParams } from '../lib/travel/flights';
import { demoOptions, initialDemo, demoVote, restoreDemo } from '../lib/travel/demo';
const now = new Date('2026-10-25T12:00:00Z');
const options = defaultCandidates(now);
const route: Route = { userId:1,name:'Friend',origin:'ELP',destination:'AUS',depart:options[0].depart,return:options[0].return,price:120,local:false,airlines:['Example'],stops:0,duration:90,quotedAt:now.toISOString(),source:'serpapi',check:true,checkSource:'nessie-sandbox' };

test('Travel validates actual dates, US airports, future ordering, options and private cap',()=>{
  assert.equal(validDay('2026-02-30'),false); assert.equal(validDay('2028-02-29'),true);
  assert.equal(validateCandidates(options,now).length,2);
  for(const candidates of [[],[options[0]], [...options,...options], options.map(o=>({...o,airport:'XXX'})),options.map(o=>({...o,depart:'2026-02-30'})),options.map(o=>({...o,depart:'2026-10-25'})),options.map(o=>({...o,return:o.depart})),[options[0],options[0]]]) assert.throws(()=>validateCandidates(candidates,now));
  assert.deepEqual(validateSetup({airport:'ELP',budget:123.45}),{airport:'ELP',budget:123.45});
  for(const budget of [0,0.001,-5,NaN,Infinity,'100',100001])assert.throws(()=>validateSetup({airport:'ELP',budget}));
  assert.throws(()=>validateSetup({airport:'LHR',budget:200}));
});
test('round trip price uses minimum best/other fare once, never insights or explicit one-way',()=>{
  assert.deepEqual(normalizeFlight({best_flights:[{price:200}],other_flights:[{type:'Round trip',price:110,flights:[{airline:'A'},{airline:'B'}],total_duration:220}],price_insights:{lowest_price:1}}),{price:110,airlines:['A','B'],stops:1,duration:220});
  for(const data of [{other_flights:[{price:45,type:'One way'}]},{other_flights:[{price:45,type:'Multi-city'}]},{price_insights:{lowest_price:1}},{best_flights:[{price:0},{price:'30'},{price:NaN}]},{error:'secret provider error',other_flights:[{price:20}]}]) assert.equal(normalizeFlight(data),null);
  assert.equal(normalizeFlight({other_flights:[{price:410}]})?.price,410);
});
test('provider request sends airport/date/economy route data only; local and absent key do not fetch',async()=>{
  let calls=0;
  const request = async (url:any, init:any)=>{calls++;const u=new URL(url);assert.equal(u.searchParams.get('type'),'1');assert.equal(u.searchParams.get('adults'),'1');assert.equal(u.searchParams.get('currency'),'USD');assert.equal(u.searchParams.get('departure_id'),'ELP');assert.ok(init.signal);assert.ok(!/budget|balance|user|name/.test(u.search));return {ok:true,json:async()=>({other_flights:[{price:130}]})} as Response;};
  const q=await fetchFlight('ELP',options[0],request,'fake-key');assert.equal(q.price,130);assert.equal(calls,1);
  const local=await fetchFlight('AUS',options[0],request,'fake-key');assert.equal(local.price,0);assert.equal(local.local,true);assert.equal(calls,1);
  const unavailable=await fetchFlight('ELP',options[0],request,'');assert.equal(unavailable.price,null);assert.match(unavailable.error!,/not configured/);assert.equal(calls,1);
  assert.equal(Object.keys(flightParams('ELP',options[0])).length,9);
});
test('provider errors and missing routes never become free fares or leak errors',async()=>{
  for(const fetcher of [async()=>{throw Error('KEY=secret');},async()=>({ok:false}),async()=>({ok:true,json:async()=>({error:'KEY=secret'})}),async()=>({ok:true,json:async()=>({})})]){
    const q=await fetchFlight('ELP',options[0],fetcher as any,'fake');assert.equal(q.price,null);assert.ok(q.error);assert.ok(!q.error.includes('secret'));
  }
});
test('comparison deduplicates origins, bounds concurrency at four and max route count at 24',async()=>{
  let active=0,max=0,calls=0;
  const find=async(origin:string,o:any)=>{calls++;active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,2));active--;return {...route,origin,destination:o.airport};};
  const quotes=await compareFlights(['ELP','ELP','ORD','IAH','DEN','JFK','SEA','LAX'],[...options,{...options[0],id:3,airport:'SEA'}],find);
  assert.equal(calls,21);assert.equal(quotes.size,21);assert.ok(max<=4);
  await assert.rejects(compareFlights(Array(9).fill('ELP'),options,find));
});
test('partial comparison never wins and public whitelist cannot upgrade missing travelers',()=>{
  const partial=optionWithTotals(options[0],[route],3);assert.equal(partial.total,null);assert.equal(partial.complete,false);
  const complete=optionWithTotals(options[1],[{...route,price:400}],1);
  const exposed=publicOptions([{...partial,privateBudget:1000} as any],now.toISOString(),now.getTime());
  assert.equal(exposed[0].complete,false);assert.equal(exposed[0].total,null);assert.equal(cheapest([partial,complete]),2);
  assert.equal(winner([partial,complete],[{userId:1,optionId:1,value:'approve'}]),2);
  assert.ok(!JSON.stringify(exposed).includes('privateBudget'));
});
test('private data is stripped and checks become unknown when stale',()=>{
  const candidate=optionWithTotals(options[0],[{...route,flight_budget:500,balance:900,nessie_account_id:'private',purchases:[1],available:800} as any],1);
  const publicData=publicOptions([candidate],now.toISOString(),now.getTime());
  for(const key of ['flight_budget','balance','nessie_account_id','purchases','available'])assert.ok(!JSON.stringify(publicData).includes(key));
  assert.equal(publicData[0].routes[0].check,true);
  assert.equal(publicOptions([candidate],now.toISOString(),now.getTime()+CHECK_TTL)[0].routes[0].check,null);
  assert.equal(publicOptions([candidate],'invalid',now.getTime())[0].routes[0].check,null);
});
test('available amount subtracts all past purchases and obligations, applies exact signed ledger',()=>{
  const p=(amount:number,date='2026-10-01',status='completed')=>({merchant_id:'m',amount,purchase_date:date,status});
  const available=availableFunds(1000,[p(100),p(50,'2020-01-01'),p(999,'2026-10-01','cancelled'),p(999,'2026-12-01')],[{kind:'out',date:'2026-10-01',amount:20,description:'WSP split|pay=1|acct=private|cents=2050|food'},{kind:'in',date:'2026-10-02',amount:40,status:'completed'}],200,now);
  assert.equal(available,669.5);
  assert.equal(availableFunds(100,[],[{kind:'in',date:'2026-10-01',amount:900,status:'pending'},{kind:'out',date:'2026-10-01',amount:30,status:'pending'}],0,now),70);
  assert.equal(availableFunds(100,[p(200)],[],0,now),0);
  assert.equal(availableFunds(null,[],[],0,now),null);
  assert.equal(availableFunds(100,[p(10,'2026-02-30')],[],0,now),null);
  assert.equal(availableFunds(100,[],[{kind:'in',date:'2026-02-30',amount:900}],0,now),null);
});
test('green requires both cap and fresh live-sandbox derived funds; mock/unlinked never green',()=>{
  const funds={available:300,checkedAt:now.getTime(),source:'nessie-sandbox' as const};
  assert.equal(budgetCheck(200,250,funds,now.getTime()),true);
  assert.equal(budgetCheck(200,150,funds,now.getTime()),false);
  assert.equal(budgetCheck(350,500,funds,now.getTime()),false);
  for(const source of ['simulated','unknown'] as const)assert.equal(budgetCheck(20,100,{...funds,source},now.getTime()),null);
  assert.equal(budgetCheck(20,100,funds,now.getTime()+CHECK_TTL),null);
  assert.equal(budgetCheck(null,100,funds,now.getTime()),null);
});
test('sample totals 410/640, voting ties deterministic, toggle restores, all veto no arbitrary winner',()=>{
  const opts=demoOptions(options);assert.equal(opts[0].total,410);assert.equal(opts[1].total,640);assert.equal(cheapest(opts),1);
  assert.equal(winner(opts,[{userId:1,optionId:1,value:'approve'},{userId:1,optionId:2,value:'approve'}]),1);
  assert.equal(winner(opts,[{userId:1,optionId:1,value:'veto'},{userId:1,optionId:2,value:'veto'}]),null);
  let votes:Ballot[]=toggleBallot([],1,1,'approve');assert.equal(votes.length,1);votes=toggleBallot(votes,1,1,'approve');assert.equal(votes.length,0);
  assert.equal(ballotComplete(opts,[],[1,2,3]),false);
});
test('interactive demo switches three voters, persists synthetic state, closes and resets',()=>{
  let s=initialDemo();
  for(const uid of [1,2,3]){s={...s,voter:uid};s=demoVote(s,1,'approve');s=demoVote(s,2,'veto');}
  assert.equal(s.status,'final');assert.equal(s.winnerId,1);
  assert.deepEqual(demoVote(s,1,'veto'),s);
  assert.deepEqual(restoreDemo(JSON.stringify(s)),s);
  assert.equal(initialDemo().ballots.length,0);
  assert.equal(restoreDemo('{bad').status,'voting');
  let all=initialDemo();for(const uid of [1,2,3]){all={...all,voter:uid};all=demoVote(all,1,'veto');all=demoVote(all,2,'veto');}assert.equal(all.status,'vetoed');assert.equal(all.winnerId,null);
});
