const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');
function load(file,mocks={}){const exports={};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;vm.runInNewContext(code,{exports,AbortSignal,Date,setTimeout,clearTimeout,navigator:{clipboard:{writeText:async()=>{}}},require(name){if(name in mocks)return mocks[name];if(name==='react/jsx-runtime')return require(name);throw Error(`Unmocked import: ${name}`);}});return exports;}
const core=load('lib/travel/core.ts');const flow=load('lib/travel/flow.ts');
const finance=load('lib/travel/finance.ts',{'../ledger':load('lib/ledger.ts'),'./core':core});
const discovery=load('lib/travel/discovery.ts',{'./core':core,'./finance':finance});
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
const text=n=>n==null||typeof n==='boolean'?'':typeof n!=='object'?String(n):Array.isArray(n)?n.map(text).join(''):text(n.props?.children);
const ui={TravelFrame:'main',TravelArt:'art',DatesEditor:'editor',DiscoverySummaryNote:'summary',ComparisonCards:'cards',TravelNotice:'notice',AirportSelect:'airport',travelButton:'primary',travelQuiet:'quiet',travelInput:'input',travelFocus:'focus'};
function harness(file,initial){
  let data=initial,index=0,refIndex=0,effects=[],calls=[],routes=[];const state=[],refs=[];
  const router={replace:path=>routes.push(path),push:path=>routes.push(path)};
  let respond=async()=>({comparisonId:11}),reloads=0;
  const page=load(file,{
    react:{use:p=>p,useState:v=>{const i=index++;if(!(i in state))state[i]=typeof v==='function'?v():v;return [state[i],v=>state[i]=typeof v==='function'?v(state[i]):v];},useRef:v=>refs[refIndex++]??(refs[refIndex-1]={current:v}),useEffect:fn=>effects.push(fn)},
    'next/link':{default:'a'},'next/navigation':{useRouter:()=>router},'@/lib/travel/discovery':discovery,'@/lib/travel/core':core,'@/lib/travel/flow':flow,
    '@/components/TravelUI':ui,'@/lib/client':{useApi:()=>({data,error:'',reload:async()=>{reloads++;return data;}}),api:async(...args)=>{calls.push(args);return respond(...args);}},
  }).default;
  const render=()=>{index=0;refIndex=0;effects=[];return page({params:{id:'5'}});};
  return {state,calls,routes,render,effect(){for(const fn of effects)fn();},setData:v=>data=v,setRespond:fn=>respond=fn,get reloads(){return reloads;}};
}
const trip=(status=null,extra={})=>({id:5,name:'Reunion',me:1,organizer:true,inviteCode:'TRIP-ABCDEF123456',dates:discovery.defaultDates(),members:[{id:1,name:'Steph',airport:'ELP',ready:true},{id:2,name:'Tony',airport:'IAH',ready:true}],comparison:status?{id:11,status,expired:false,stalled:false,options:[{id:1,airport:'AUS',routes:[],complete:true,total:410},{id:2,airport:'DEN',routes:[],complete:true,total:640}],myVotes:[],voted:0,winnerId:1,...extra}:null});
const click=(tree,label)=>nodes(tree).find(n=>n.type==='button'&&text(n)===label);

test('phase and entry routing: incomplete setup first, final stays final after estimate expiry',()=>{
  assert.equal(flow.travelEntry(5,false),'/travel/5/setup');assert.equal(flow.travelEntry(5,true),'/travel/5');
  assert.equal(flow.travelPhase(null,1,2),'setup');assert.equal(flow.travelPhase(null,2,2),'ready');
  assert.equal(flow.travelPhase({status:'final',expired:true},2,2),'final');assert.equal(flow.travelPhase({status:'voting',expired:true},2,2),'expired');
  assert.equal(flow.findingDestination(5,{id:11,status:'final'},null),null);
  assert.equal(flow.findingDestination(5,{id:11,status:'voting'},11),'/travel/5/plans');
  assert.equal(flow.findingDestination(5,{id:12,status:'voting'},11),null);
});
test('finding mount, read-only check and pending resume never start a paid search',async()=>{
  for(const status of [null,'generating','failed','stale','final']){
    const h=harness('app/travel/[id]/finding/page.tsx',trip(status));let tree=h.render();h.effect();tree=h.render();h.effect();
    assert.equal(h.calls.length,0);assert.equal(h.routes.length,0);
    await click(tree,'Check search status').props.onClick();assert.equal(h.reloads,1);assert.equal(h.calls.length,0);
    if(status==='generating')assert.equal(click(tree,'Search in progress').props.disabled,true);
  }
});
test('one deliberate search, no double click, ready navigation and existing generation completion',async()=>{
  const h=harness('app/travel/[id]/finding/page.tsx',trip());let release;h.setRespond(()=>new Promise(r=>release=r));
  let tree=h.render();const start=click(tree,'Find flights');const pending=start.props.onClick();start.props.onClick();assert.equal(h.calls.length,1);
  assert.equal(h.calls[0][0],'/api/travel/5/compare');assert.equal(h.calls[0][1],'POST');
  h.setData(trip('voting'));release({comparisonId:11});await pending;tree=h.render();h.effect();assert.deepEqual(h.routes,['/travel/5/plans']);
  const resume=harness('app/travel/[id]/finding/page.tsx',trip('generating'));resume.render();resume.effect();resume.setData(trip('voting'));resume.render();resume.effect();assert.deepEqual(resume.routes,['/travel/5/plans']);assert.equal(resume.calls.length,0);
});
test('retry is explicit; final refresh page does not bounce back automatically',async()=>{
  const failed=harness('app/travel/[id]/finding/page.tsx',trip('failed',{error:'No fares found'}));const tree=failed.render();failed.effect();assert.match(text(tree),/No fares found/);assert.equal(failed.calls.length,0);await click(tree,'Retry flight search').props.onClick();assert.equal(failed.calls.length,1);
  const final=harness('app/travel/[id]/finding/page.tsx',trip('final'));const page=final.render();final.effect();assert.equal(final.routes.length,0);assert.equal(final.calls.length,0);assert.ok(click(page,'Refresh fares & start new vote'));
});
test('lobby readiness/phase CTAs and setup edits preserve typed values on reload',()=>{
  for(const [status,href]of[['voting','/travel/5/plans'],['final','/travel/5/final'],['generating','/travel/5/finding']]){
    const h=harness('app/travel/[id]/page.tsx',trip(status));const tree=h.render();assert.ok(nodes(tree).some(n=>n.type==='a'&&n.props.href===href));assert.equal(h.calls.length,0);
    assert.equal(nodes(tree).find(n=>n.props?.role==='progressbar').props['aria-valuenow'],2);
  }
  const incomplete=trip();incomplete.members[0].ready=false;const h=harness('app/travel/[id]/page.tsx',incomplete);assert.ok(text(h.render()).includes('Finish my setup'));
  const setup=harness('app/travel/[id]/setup/page.tsx',{airport:'ELP',budget:200});setup.render();setup.effect();let tree=setup.render();nodes(tree).find(n=>n.type==='input').props.onChange({target:{value:'345'}});setup.setData({airport:'ELP',budget:200});setup.render();setup.effect();tree=setup.render();assert.equal(nodes(tree).find(n=>n.type==='input').props.value,'345');
});
test('plans use anonymous progress, disable stale/expired ballots, final redirects without voting',()=>{
  for(const status of ['stale','failed','final','voting']){
    const data=trip(status,status==='voting'?{expired:true}:{});const h=harness('app/travel/[id]/plans/page.tsx',data);const tree=h.render();h.effect();
    assert.equal(nodes(tree).find(n=>n.type==='cards').props.voting,false);assert.equal(h.calls.length,0);
    assert.ok(nodes(tree).some(n=>n.type==='a'&&n.props.href===(status==='final'?'/travel/5/final':'/travel/5/finding')));
  }
  const open=harness('app/travel/[id]/plans/page.tsx',trip('voting'));const tree=open.render();assert.equal(nodes(tree).find(n=>n.type==='cards').props.voting,true);assert.match(text(tree),/0 of 2 have voted/);
});
test('dedicated final shows only winner, retains expired choice, never votes or claims lowest cost',()=>{
  const h=harness('app/travel/[id]/final/page.tsx',trip('final',{expired:true,winnerId:2}));const tree=h.render();const cards=nodes(tree).find(n=>n.type==='cards');assert.equal(cards.props.options.length,1);assert.equal(cards.props.options[0].id,2);assert.equal(cards.props.voting,false);assert.equal(cards.props.showRecommendation,false);assert.match(text(tree),/estimates have expired/);assert.equal(h.calls.length,0);
  assert.ok(nodes(tree).some(n=>n.type==='a'&&n.props.href==='/travel/5/finding'));assert.ok(!text(tree).includes('Vote on'));
});
test('dashboard partitions voting trips with no inline create or join; demo remains secondary',()=>{
  const list=[{id:5,name:'Vote',members:2,ready:2,setupDone:true,phase:'voting',myVoted:false},{id:4,name:'Final',members:2,ready:2,setupDone:true,phase:'final'},{id:3,name:'Setup',members:2,ready:1,setupDone:false,phase:'setup'}];
  const h=harness('app/travel/page.tsx',list);let tree=h.render();assert.equal(nodes(tree).filter(n=>n.type==='article').length,1);assert.ok(nodes(tree).some(n=>n.props?.['aria-label']==='Trips with voting open'));assert.ok(nodes(tree).some(n=>n.type==='a'&&n.props.href==='/travel/3/setup'));
  assert.equal(nodes(tree).filter(n=>n.type==='form'||n.type==='input').length,0);assert.ok(!nodes(tree).some(n=>n.type==='a'&&n.props.href==='/travel/new'));
  const empty=harness('app/travel/page.tsx',[]);assert.match(text(empty.render()),/No trips yet/);
});
test('create goes to private setup; no top mode switches remain and bottom Travel navigation stays',async()=>{
  const h=harness('app/travel/new/page.tsx',null);h.setRespond(async()=>({id:8}));await nodes(h.render()).find(n=>n.type==='form'&&n.props['aria-label']==='Create trip').props.onSubmit({preventDefault(){}});assert.deepEqual(h.routes,['/travel/8/setup']);
  for(const file of ['components/TravelUI.tsx','app/groups/page.tsx'])assert.ok(!fs.readFileSync(file,'utf8').includes('aria-label="WSP mode"'));
  assert.ok(fs.readFileSync('components/TabBar.tsx','utf8').includes('{ href: "/travel", label: "Travel" }'));
});


test('plus screen joins before shared date editor and routes according to own setup',async()=>{
  for(const setupDone of [false,true]){
    const h=harness('app/travel/new/page.tsx',null);let tree=h.render();
    const forms=nodes(tree).filter(n=>n.type==='form');assert.deepEqual(forms.map(n=>n.props['aria-label']),['Join trip','Create trip']);
    assert.equal(nodes(forms[0]).some(n=>n.type==='editor'),false);assert.ok(nodes(forms[1]).some(n=>n.type==='editor'));
    assert.ok(nodes(tree).some(n=>n.type==='a'&&n.props.href==='/travel'));
    nodes(tree).find(n=>n.type==='input'&&n.props.placeholder==='TRIP-…').props.onChange({target:{value:'TRIP-ABCDEF123456'}});
    h.setRespond(async()=>({id:7,setupDone}));tree=h.render();await nodes(tree).find(n=>n.type==='form'&&n.props['aria-label']==='Join trip').props.onSubmit({preventDefault(){}});
    assert.deepEqual(h.routes,[setupDone?'/travel/7':'/travel/7/setup']);assert.equal(h.calls[0][0],'/api/travel/join');
  }
});
test('create and join errors stay in their own forms; shared busy guard prevents duplicate requests',async()=>{
  const h=harness('app/travel/new/page.tsx',null);
  const submit=(tree,label)=>nodes(tree).find(n=>n.type==='form'&&n.props['aria-label']===label).props.onSubmit({preventDefault(){}});
  h.setRespond(async()=>{throw Error('Invite not found');});await submit(h.render(),'Join trip');
  let tree=h.render();assert.match(text(nodes(tree).find(n=>n.type==='form'&&n.props['aria-label']==='Join trip')),/Invite not found/);
  assert.ok(!text(nodes(tree).find(n=>n.type==='form'&&n.props['aria-label']==='Create trip')).includes('Invite not found'));
  nodes(tree).find(n=>n.type==='editor').props.onChange({depart:'invalid',return:'invalid'});await submit(h.render(),'Create trip');
  tree=h.render();assert.match(text(nodes(tree).find(n=>n.type==='form'&&n.props['aria-label']==='Create trip')),/Choose a future departure/);assert.equal(h.calls.length,1);
  let release;h.setRespond(()=>new Promise(r=>release=r));tree=h.render();const pending=submit(tree,'Join trip');submit(tree,'Join trip');submit(tree,'Create trip');
  assert.equal(h.calls.length,2);tree=h.render();assert.ok(nodes(tree).filter(n=>n.type==='button').every(n=>n.props.disabled));release({id:5,setupDone:false});await pending;
});


test('global navigation hides the bottom bar on Travel creation and demo, but keeps it on trip pages', () => {
  let path = '/travel/new';
  const { AppTabBar } = load('components/AppTabBar.tsx', {
    react: { useState: value => [value, () => {}], useEffect() {} },
    'next/navigation': { usePathname: () => path },
    './TabBar': { TabBar: 'nav' },
  });
  for (const [route, visible] of [['/travel/new', false], ['/travel/demo', false], ['/travel', true], ['/travel/5/plans', true], ['/groups', true]]) {
    path = route;
    const tree = AppTabBar({ children: 'content' });
    assert.equal(nodes(tree).some(node => node.type === 'nav'), visible, route);
    assert.equal(tree.props.style['--tab-bar-height'] === '0px', !visible, route);
  }
});
