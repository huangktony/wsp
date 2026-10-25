// Persisted service exercised with a transactional in-memory SQL adapter: no DB or network.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');
function load(file,mocks={}){const exports={};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;vm.runInNewContext(code,{exports,process:{env:{}},Date,require(name){if(name in mocks)return mocks[name];throw Error(`Unmocked import: ${name}`);}});return exports;}
const core=load('lib/travel/core.ts');
const ledger=load('lib/ledger.ts');
const finance=load('lib/travel/finance.ts',{'../ledger':ledger,'./core':core});
const discovery=load('lib/travel/discovery.ts',{'./core':core,'./finance':finance});
function fixture(failure=null){
  const trip={id:5,name:'Reunion',organizer_id:1,invite_code:'TRIP-ABCDEF123456',revision:1,candidates:core.defaultCandidates()};
  const members=[1,2,3].map((user_id,i)=>({user_id,name:['Steph','Tony','Ravi'][i],airport:['ELP','IAH','ORD'][i],flight_budget:300,nessie_account_id:'mock-private-account'}));
  const comparisons=[],votes=[];let serial=10,generationCalls=0,financialCalls=0,hold=null,gate=Promise.resolve();
  const query=async(sql,a=[])=>{
    if(sql==='begin'||sql==='commit'||sql==='rollback')return {rows:[]};
    if(sql.startsWith('select t.*'))return {rows:a[0]===5&&members.some(m=>m.user_id===a[1])?[trip]:[]};
    if(sql.startsWith('select * from travel_trips'))return {rows:a[0]===trip.invite_code?[trip]:[]};
    if(sql.startsWith('select m.user_id'))return {rows:members.map(m=>({...m}))};
    if(sql.startsWith('select * from travel_comparisons'))return {rows:comparisons.length?[comparisons.at(-1)]:[]};
    if(sql.startsWith('select airport,flight_budget')){const m=members.find(m=>m.user_id===a[1]);return {rows:[{airport:m.airport,budget:m.flight_budget}]};}
    if(sql.startsWith('update travel_members')){const m=members.find(m=>m.user_id===a[1]);const changed=m.airport!==a[2]||m.flight_budget!==a[3];m.airport=a[2];m.flight_budget=a[3];return {rows:changed?[{user_id:m.user_id}]:[]};}
    if(sql.startsWith('insert into travel_members')){members.push({user_id:a[1],name:'New',airport:null,flight_budget:null,nessie_account_id:null});return {rows:[]};}
    if(sql.startsWith('update travel_trips set revision')){trip.revision++;return {rows:[]};}
    if(sql.startsWith('update travel_trips set candidates')){trip.candidates=JSON.parse(a[1]);return {rows:[]};}
    if(sql.startsWith("update travel_comparisons set status='stale'")){comparisons.filter(r=>['generating','voting','final','vetoed'].includes(r.status)).forEach(r=>r.status='stale');return {rows:[]};}
    if(sql.startsWith('insert into travel_comparisons')){const r={id:++serial,trip_id:a[0],revision:a[1],status:'generating',member_ids:a[2],options:a[3]?JSON.parse(a[3]):[],created_at:new Date(),checked_at:null,expires_at:null,winner_id:null,error:null};comparisons.push(r);return {rows:[{id:r.id}]};}
    if(sql.startsWith('update travel_comparisons set status=$2,options')){Object.assign(comparisons.find(r=>r.id===a[0]),{status:a[1],options:JSON.parse(a[2]),checked_at:new Date(a[4]),expires_at:new Date(Date.now()+900000),error:a[3]});return {rows:[]};}
    if(sql.startsWith('update travel_comparisons set status=$2,winner')){Object.assign(comparisons.find(r=>r.id===a[0]),{status:a[1],winner_id:a[2]});return {rows:[]};}
    if(sql.startsWith("update travel_comparisons set status='failed'")){const r=comparisons.find(r=>r.id===a[0]);if(r?.status==='generating')r.status='failed';return {rows:[]};}
    if(sql.startsWith('select user_id as'))return {rows:votes.filter(v=>v.comparisonId===a[0]).map(({comparisonId,...v})=>v)};
    if(sql.startsWith('insert into travel_votes')){const old=votes.find(v=>v.comparisonId===a[0]&&v.userId===a[1]&&v.optionId===a[2]);if(old)old.value=a[3];else votes.push({comparisonId:a[0],userId:a[1],optionId:a[2],value:a[3]});return {rows:[]};}
    if(sql.startsWith('delete from travel_votes')){const i=votes.findIndex(v=>v.comparisonId===a[0]&&v.userId===a[1]&&v.optionId===a[2]);if(i>=0)votes.splice(i,1);return {rows:[]};}
    throw Error(`Unexpected query: ${sql}`);
  };
  const pool={connect:async()=>{let unlock;return {release(){unlock?.();unlock=null;},query:async(sql,args)=>{
    if(sql.includes('pg_advisory_xact_lock')){const before=gate;gate=new Promise(r=>unlock=r);await before;return {rows:[]};}
    const result=await query(sql,args);if(sql==='commit'||sql==='rollback'){unlock?.();unlock=null;}return result;
  }};}};
  const service=load('lib/travel/service.ts',{
    '../db':{pool,q:async(sql,a)=>(await query(sql,a)).rows,q1:async()=>({owed:50})},'node:crypto':require('node:crypto'),
    '../nessie':{isLiveAccount:id=>id==='live-test',loadSpending:async()=>{financialCalls++;return {balance:500,purchases:[{merchant_id:'m',amount:100,purchase_date:'2020-01-01',status:'completed'}],ledger:[]};}},
    './flow':load('lib/travel/flow.ts'),'./discovery':discovery,'./core':core,'./finance':finance,'./flights':{compareFlights:async(origins,options)=>{generationCalls++;if(hold)await hold;return new Map(origins.flatMap((origin,i)=>options.map(o=>[`${origin}/${o.id}`,{origin,destination:o.airport,depart:o.depart,return:o.return,failure,error:failure?'private raw error':undefined,price:failure?null:origin===o.airport?0:o.id===1?[120,110,180][i]:o.id===2?[180,210,250][i]:1000,local:origin===o.airport,airlines:['Example'],stops:0,duration:100,quotedAt:new Date().toISOString(),source:'serpapi'}])));}},
  });
  return {service,trip,members,comparisons,votes,get generationCalls(){return generationCalls;},get financialCalls(){return financialCalls;},setHold(p){hold=p;}};
}
test('every persisted trip operation denies nonmembers; organizer-only edits, search and close',async()=>{
  const f=fixture();const s=f.service;
  for(const call of [()=>s.readTrip(5,99),()=>s.ownSetup(5,99),()=>s.saveSetup(5,99,{airport:'ELP',budget:100}),()=>s.saveDates(5,99,{candidates:f.trip.candidates}),()=>s.startComparison(5,99),()=>s.castVote(5,99,{comparisonId:11,optionId:1,value:'approve'}),()=>s.closeComparison(5,99,{comparisonId:11})])await assert.rejects(call(),e=>e.status===403);
  await assert.rejects(s.saveDates(5,2,{candidates:f.trip.candidates}),e=>e.status===403);
  await assert.rejects(s.startComparison(5,2),e=>e.status===403);
  await assert.rejects(s.closeComparison(5,2,{comparisonId:11}),e=>e.status===403);
  assert.equal(f.generationCalls,0);
});
test('own setup cannot target another user and private values never appear in trip JSON',async()=>{
  const f=fixture();await assert.rejects(f.service.saveSetup(5,1,{userId:2,airport:'DEN',budget:100}),e=>e.status===403);
  await f.service.saveSetup(5,1,{airport:'DEN',budget:175});assert.equal(f.members[0].airport,'DEN');assert.equal(f.members[1].airport,'IAH');
  const own=await f.service.ownSetup(5,1);assert.equal(own.budget,175);
  const data=await f.service.readTrip(5,1);const raw=JSON.stringify(data);
  for(const key of ['budget','nessie','account','balance','175','300'])assert.ok(!raw.includes(key),key);
});
test('setup completeness blocks comparison and simultaneous callers have one generation owner',async()=>{
  const f=fixture();f.members[1].airport=null;await assert.rejects(f.service.startComparison(5,1),e=>e.status===409);assert.equal(f.generationCalls,0);f.members[1].airport='IAH';
  let release;f.setHold(new Promise(r=>release=r));const first=f.service.startComparison(5,1);
  while(!f.generationCalls)await new Promise(setImmediate);
  const second=await f.service.startComparison(5,1);release();const one=await first;
  assert.equal(one.comparisonId,second.comparisonId);assert.equal(f.generationCalls,1);assert.equal(f.comparisons.length,1);
});
test('settings update invalidates pending search and late provider cannot publish old fares',async()=>{
  const f=fixture();let release;f.setHold(new Promise(r=>release=r));const pending=f.service.startComparison(5,1);while(!f.generationCalls)await new Promise(setImmediate);
  await f.service.saveSetup(5,2,{airport:'ORD',budget:150});release();await assert.rejects(pending,e=>e.status===409);
  assert.equal(f.comparisons[0].status,'stale');assert.equal(f.comparisons[0].options.options.length,0);
  f.setHold(null);await f.service.startComparison(5,1);assert.equal(f.comparisons.at(-1).revision,2);
});
test('Nessie reads are private, mock accounts never green, live derived cap respected',async()=>{
  const f=fixture();f.members[0].nessie_account_id='live-test';f.members[0].flight_budget=130;
  await f.service.startComparison(5,1);const data=await f.service.readTrip(5,1);
  assert.equal(f.financialCalls,1);assert.equal(data.comparison.options[0].routes[0].check,true);assert.equal(data.comparison.options.length,1,'over-cap destinations never enter the public comparison');
  assert.equal(data.comparison.options[0].routes[1].check,null);assert.equal(data.comparison.options[0].routes[1].checkSource,'simulated');
  const raw=JSON.stringify(data);for(const key of ['flight_budget','nessie_account','balance','purchases','ledger','available','live-test'])assert.ok(!raw.includes(key),key);
});
test('ballots restore only own selections; concurrent last votes close once and final rejects edits',async()=>{
  const f=fixture();const {comparisonId}=await f.service.startComparison(5,1);
  await f.service.castVote(5,1,{comparisonId,optionId:1,value:'approve'});
  const mine=await f.service.readTrip(5,1);const other=await f.service.readTrip(5,2);
  assert.equal(mine.comparison.myVotes.length,1);assert.equal(other.comparison.myVotes.length,0);assert.equal(other.comparison.tally,undefined);assert.equal(other.comparison.voted,1);
  await f.service.castVote(5,1,{comparisonId,optionId:1,value:null});assert.equal((await f.service.readTrip(5,1)).comparison.myVotes.length,0);
  for(const uid of [1,2])for(const [optionId,value] of [[1,'approve'],[2,'veto']])await f.service.castVote(5,uid,{comparisonId,optionId,value});
  await Promise.all([f.service.castVote(5,3,{comparisonId,optionId:1,value:'approve'}),f.service.castVote(5,3,{comparisonId,optionId:2,value:'veto'})]);
  assert.equal(f.comparisons[0].status,'final');assert.equal(f.comparisons[0].winner_id,1);
  await assert.rejects(f.service.castVote(5,1,{comparisonId,optionId:1,value:'veto'}),e=>e.status===409);
  assert.ok((await f.service.readTrip(5,1)).comparison.tally);
});
test('refresh invalidates old ballot version; expired prices reject voting and invalid options reject',async()=>{
  const f=fixture();const old=await f.service.startComparison(5,1);const fresh=await f.service.startComparison(5,1);
  await assert.rejects(f.service.castVote(5,1,{comparisonId:old.comparisonId,optionId:1,value:'approve'}),e=>e.status===409);
  await assert.rejects(f.service.castVote(5,1,{comparisonId:fresh.comparisonId,optionId:99,value:'approve'}),e=>e.status===409);
  f.comparisons.at(-1).expires_at=new Date(Date.now()-1);
  await assert.rejects(f.service.castVote(5,1,{comparisonId:fresh.comparisonId,optionId:1,value:'approve'}),e=>e.status===409);
  assert.equal((await f.service.readTrip(5,1)).comparison.expired,true);
});
test('joining is idempotent and invalidates old comparison, max eight members enforced',async()=>{
  const f=fixture();await f.service.startComparison(5,1);
  await f.service.joinTrip(1,{code:'trip-abcdef123456'});assert.equal(f.trip.revision,1);
  await f.service.joinTrip(4,{code:f.trip.invite_code});assert.equal(f.trip.revision,2);assert.equal(f.comparisons[0].status,'stale');
  for(const uid of [5,6,7,8])await f.service.joinTrip(uid,{code:f.trip.invite_code});
  await assert.rejects(f.service.joinTrip(9,{code:f.trip.invite_code}),e=>e.status===409);assert.equal(f.members.length,8);
});
test('HTTP auth runs before service, missing schema gives actionable safe 503, malformed input gives 400',async()=>{
  let uid={status:401};const f=fixture();
  const http=load('lib/travel/http.ts',{'../api':{requireUser:async()=>uid,json:body=>({status:200,body}),fail:(error,status)=>({status,body:{error}})},'./service':f.service,'./core':core});
  let calls=0;assert.equal((await http.travelHandler(async()=>{calls++;})).status,401);assert.equal(calls,0);
  uid=1;const missing=await http.travelHandler(async()=>{throw {code:'42P01',message:'secret db text'};});assert.equal(missing.status,503);assert.match(missing.body.error,/migration/);assert.ok(!missing.body.error.includes('secret'));
  const bad=await http.travelHandler(async()=>core.validateSetup({airport:'BAD',budget:1}));assert.equal(bad.status,400);
});

test('all configuration/provider failures remain actionable and never imply a budget failure',async()=>{
  for(const failure of ['configuration','provider']){
    const f=fixture(failure);await f.service.startComparison(5,1);
    const data=await f.service.readTrip(5,1);
    assert.equal(data.comparison.status,'failed');assert.equal(data.comparison.options.length,0);
    assert.match(data.comparison.error,failure==='configuration'?/not configured/:/provider unavailable/);
    assert.doesNotMatch(data.comparison.error,/budget|private raw error/);
  }
});
