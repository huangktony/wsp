// The shared Travel components, loaded for real: every visible sentence is short and states something the user cannot already see.
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');
function load(file,mocks={}){const exports={};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;vm.runInNewContext(code,{exports,Date,Intl,require(name){if(name in mocks)return mocks[name];if(name==='react/jsx-runtime')return require(name);throw Error(`Unmocked import: ${name}`);}});return exports;}
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
const text=n=>n==null||typeof n==='boolean'?'':typeof n!=='object'?String(n):Array.isArray(n)?n.map(text).join(''):text(n.props?.children);
const core=load('lib/travel/core.ts');const format=load('lib/travel/format.ts');
const ui=load('components/TravelUI.tsx',{'next/link':{default:'a'},'./Page':{Page:'page'},'next/font/google':{Inter:()=>({className:'inter'})},'./Skeleton':{Skeleton:'skeleton',SkeletonBlock:'block'},'@/lib/travel/discovery':{},'@/lib/travel/core':core,'@/lib/travel/format':format});
const YEAR=new Date().getUTCFullYear();
const route=(over={})=>({userId:1,name:'Steph',origin:'ELP',destination:'AUS',depart:`${YEAR}-11-24`,return:`${YEAR}-11-27`,price:120,local:false,airlines:['Southwest'],stops:0,duration:623,quotedAt:'2026-10-25T14:05:41Z',source:'serpapi',check:true,checkSource:'nessie-sandbox',...over});
const option=(over={},routeOver={})=>({id:1,airport:'AUS',depart:`${YEAR}-11-24`,return:`${YEAR}-11-27`,total:120,complete:true,routes:[route(routeOver)],...over});
const cards=(o,props={})=>ui.ComparisonCards({options:[o],myVotes:[],voting:false,...props});

test('fare warning says nothing until fares have expired',()=>{
  assert.equal(ui.FareWarning({}),null);assert.equal(ui.FareWarning({expired:false}),null);
  assert.equal(text(ui.FareWarning({expired:true})),'Fares expired. Recheck before booking.');
});
test('discovery summary is one sentence, with a different one when nothing fits, and a Sample prefix in the demo',()=>{
  assert.equal(ui.DiscoverySummaryNote({summary:null}),null);
  assert.equal(text(ui.DiscoverySummaryNote({summary:{searchedCount:6,qualifiedCount:2,returnedCount:2}})),'2 of 6 destinations fit everyone’s budget.');
  assert.equal(text(ui.DiscoverySummaryNote({summary:{searchedCount:6,qualifiedCount:0,returnedCount:0}})),'No destination fits everyone’s budget yet.');
  assert.equal(text(ui.DiscoverySummaryNote({summary:{searchedCount:6,qualifiedCount:2,returnedCount:2},demo:true})),'Sample: 2 of 6 destinations fit everyone’s budget.');
  assert.equal(text(ui.DiscoverySummaryNote({summary:{searchedCount:6,qualifiedCount:0,returnedCount:0},demo:true})),'Sample: No destination fits everyone’s budget yet.');
  const t=text(ui.DiscoverySummaryNote({summary:{searchedCount:6,qualifiedCount:2,returnedCount:2}}));assert.ok(!/curated|over-budget|exhaustive/.test(t));
});
test('the notice is one short line about estimates, the sandbox and never booking',()=>{
  const t=text(ui.TravelNotice());assert.equal(t,'Fare estimates only. Budget checks use the Nessie sandbox. We never book or move money.');
  assert.equal(t.split(/(?<=\.)\s/).length,3);
});
test('the dates editor has its legend and two dates but no helper paragraph',()=>{
  const tree=ui.DatesEditor({value:{depart:'2026-11-24',return:'2026-11-27'},onChange(){}});
  assert.equal(nodes(tree).filter(n=>n.type==='p').length,0);assert.match(text(tree),/When can everyone travel\?/);
  assert.equal(nodes(tree).filter(n=>n.type==='input'&&n.props.type==='date').length,2);
});
test('a card shows the date range, hours and minutes, and a short budget line',()=>{
  const t=text(cards(option()));
  assert.match(t,/Nov 24 – 27 · group total/);assert.match(t,/10h 23m/);assert.ok(!/min outbound|→ 20/.test(t));
  assert.match(t,/✅ Within budget/);assert.ok(!/Private check passed|Nessie sandbox/.test(t));
});
test('the detailed aria-label on the check line is kept',()=>{
  const p=nodes(cards(option())).find(n=>n.type==='p'&&n.props['aria-label']);
  assert.equal(p.props['aria-label'],'Nessie sandbox private flight budget check passed');
  const bad=nodes(cards(option({},{check:null}))).find(n=>n.type==='p'&&n.props['aria-label']);
  assert.equal(bad.props['aria-label'],'Private flight budget check needs attention or is unavailable');
});
test('an unavailable or unverified check is a warning, and a simulated account is never shown as passed',()=>{
  assert.match(text(cards(option({},{check:null,checkSource:'unknown'}))),/⚠️ Budget check unavailable/);
  assert.match(text(cards(option({},{check:false}))),/⚠️ Budget check unavailable/);
  const sim=cards(option({},{check:true,checkSource:'simulated'}));
  assert.match(text(sim),/⚠️ Budget check unavailable/);assert.ok(!/✅/.test(text(sim)));
  assert.equal(nodes(sim).find(n=>n.type==='p'&&n.props['aria-label']).props['aria-label'],'Private flight budget check needs attention or is unavailable');
});
test('the card footer is "Fares as of" with no seconds, and the demo says Sample fares',()=>{
  const t=text(cards(option()));
  assert.match(t,/Fares as of [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} [AP]M/);assert.ok(!/:\d\d:\d\d|Estimated|guaranteed|lowest fare/.test(t));
  assert.match(text(cards(option({},{quotedAt:'not a date'}))),/Fares as of comparison time/);
  const demo=text(cards(option(),{demo:true}));assert.match(demo,/Sample fares/);assert.match(demo,/✅ Simulated check/);assert.ok(!/Fares as of|Within budget/.test(demo));
});
test('the redundant "within everyone\'s private check" line is gone',()=>{
  assert.ok(!/Within everyone|private flight check at comparison time/.test(text(cards(option()))));
});
test('a recommendation keeps its chip but loses the explaining paragraph',()=>{
  const t=text(cards(option({recommendation:{kind:'lowest-cost',label:'Best value',reason:'UNIQUE REASON TEXT'}})));
  assert.match(t,/Best value/);assert.ok(!/UNIQUE REASON TEXT/.test(t));
});
test('a missing duration prints nothing, never null or NaN',()=>{
  const t=text(cards(option({},{duration:null})));assert.ok(!/null|NaN|undefined/.test(t));
  assert.match(text(cards(option({complete:false,total:null}))),/Some routes are missing/);
});
test('dates in another year show the year, in the current year they do not',()=>{
  assert.ok(!text(cards(option())).includes(String(YEAR)));
  assert.match(text(cards(option({depart:`${YEAR+1}-03-10`,return:`${YEAR+1}-03-14`}))),new RegExp(`Mar 10 – 14, ${YEAR+1}`));
});
