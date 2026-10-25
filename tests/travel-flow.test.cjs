const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');
function load(file,mocks={}){const exports={};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;vm.runInNewContext(code,{exports,AbortSignal,Date,setTimeout,clearTimeout,setInterval:()=>0,clearInterval:()=>{},navigator:{clipboard:{writeText:async()=>{}}},require(name){if(name in mocks)return mocks[name];if(name==='react/jsx-runtime')return require(name);throw Error(`Unmocked import: ${name}`);}});return exports;}
const core=load('lib/travel/core.ts');const flow=load('lib/travel/flow.ts');const format=load('lib/travel/format.ts');
const finance=load('lib/travel/finance.ts',{'../ledger':load('lib/ledger.ts'),'./core':core});
const discovery=load('lib/travel/discovery.ts',{'./core':core,'./finance':finance});
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
const text=n=>n==null||typeof n==='boolean'?'':typeof n!=='object'?String(n):Array.isArray(n)?n.map(text).join(''):text(n.props?.children);
const inviteLib=load('lib/inviteCodeInput.ts');
const ui={TravelFrame:'main',TravelSkeleton:'skeleton',FareWarning:'fare-warning',TravelArt:'art',DatesEditor:'editor',ScopePicker:'scope',DiscoverySummaryNote:'summary',ComparisonCards:'cards',TravelNotice:'notice',AirportSelect:'airport',travelButton:'primary',travelQuiet:'quiet',travelInput:'input',travelFocus:'focus'};
function harness(file,initial){
  let data=initial,index=0,refIndex=0,effects=[],calls=[],routes=[];const state=[],refs=[];
  const router={replace:path=>routes.push(path),push:path=>routes.push(path)};
  let respond=async()=>({comparisonId:11}),reloads=0;
  const page=load(file,{
    react:{use:p=>p,useState:v=>{const i=index++;if(!(i in state))state[i]=typeof v==='function'?v():v;return [state[i],v=>state[i]=typeof v==='function'?v(state[i]):v];},useRef:v=>refs[refIndex++]??(refs[refIndex-1]={current:v}),useEffect:fn=>effects.push(fn)},
    'next/font/google':{Inter:()=>({className:'inter'})},'@/components/Page':{Page:'page'},'@/components/Smiley':{Smiley:'smiley'},'@/components/BackButton':{BackButton:'back'},'@/components/InviteCodeInput':{InviteCodeInput:'invite'},'@/lib/inviteCodeInput':inviteLib,'next/link':{default:'a'},'next/navigation':{useRouter:()=>router},'@/lib/travel/discovery':discovery,'@/lib/travel/core':core,'@/lib/travel/flow':flow,'@/lib/travel/format':format,
    '@/components/TravelUI':ui,'@/lib/client':{useApi:()=>({data,error:'',reload:async()=>{reloads++;return data;}}),api:async(...args)=>{calls.push(args);return respond(...args);}},
  }).default;
  const render=()=>{index=0;refIndex=0;effects=[];return page({params:{id:'5'}});};
  return {state,calls,routes,render,effect(){for(const fn of effects)fn();},setData:v=>data=v,setRespond:fn=>respond=fn,get reloads(){return reloads;}};
}
const trip=(status=null,extra={})=>({id:5,name:'Reunion',me:1,organizer:true,inviteCode:'TRIP-ABCDEF123456',dates:discovery.defaultDates(),members:[{id:1,name:'Steph',airport:'ELP',ready:true},{id:2,name:'Tony',airport:'IAH',ready:true}],comparison:status?{id:11,status,expired:false,stalled:false,options:[{id:1,airport:'AUS',routes:[],complete:true,total:410},{id:2,airport:'DEN',routes:[],complete:true,total:640}],myVotes:[],voted:0,winnerId:1,confirmed:0,myConfirmed:false,canConfirm:false,removedOptionIds:[],deadline:new Date(Date.now()+864e5).toISOString(),redraw:{votes:0,members:2,needed:2,mine:false},...extra}:null});
const click=(tree,label)=>nodes(tree).find(n=>n.type==='button'&&text(n)===label);

test('phase and entry routing: incomplete setup first, final stays final after estimate expiry',()=>{
  assert.equal(flow.travelEntry(5,false),'/travel/5/setup');assert.equal(flow.travelEntry(5,true),'/travel/5');
  assert.equal(flow.travelPhase(null,1,2),'setup');assert.equal(flow.travelPhase(null,2,2),'ready');
  assert.equal(flow.travelPhase({status:'final',expired:true},2,2),'final');assert.equal(flow.travelPhase({status:'voting',expired:true},2,2),'voting');
  assert.equal(flow.findingDestination(5,{id:11,status:'final'},null),null);
  assert.equal(flow.findingDestination(5,{id:11,status:'voting'},11),'/travel/5/plans');
  assert.equal(flow.findingDestination(5,{id:12,status:'voting'},11),null);
});
test('finding mount and pending resume never start a paid search, and there is no manual status button (the page polls)',async()=>{
  for(const status of [null,'generating','failed','stale','final']){
    const h=harness('app/travel/[id]/finding/page.tsx',trip(status));let tree=h.render();h.effect();tree=h.render();h.effect();
    assert.equal(h.calls.length,0);assert.equal(h.routes.length,0);
    assert.equal(click(tree,'Check search status'),undefined);assert.equal(h.calls.length,0);
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
  const final=harness('app/travel/[id]/finding/page.tsx',trip('final'));const page=final.render();final.effect();assert.equal(final.routes.length,0);assert.equal(final.calls.length,0);assert.equal(click(page,'Find new destinations'),undefined);assert.match(text(page),/group must vote for new options first/);
});
test('lobby readiness/phase CTAs and setup edits preserve typed values on reload',()=>{
  for(const [status,href]of[['voting','/travel/5/plans'],['final','/travel/5/final'],['generating','/travel/5/finding']]){
    const h=harness('app/travel/[id]/page.tsx',trip(status));const tree=h.render();assert.ok(nodes(tree).some(n=>n.type==='a'&&n.props.href===href));assert.equal(h.calls.length,0);
    assert.equal(nodes(tree).find(n=>n.props?.role==='progressbar').props['aria-valuenow'],2);
  }
  const incomplete=trip();incomplete.members[0].ready=false;const h=harness('app/travel/[id]/page.tsx',incomplete);assert.ok(text(h.render()).includes('Finish my setup'));
  const setup=harness('app/travel/[id]/setup/page.tsx',{airport:'ELP',budget:200});setup.render();setup.effect();let tree=setup.render();nodes(tree).find(n=>n.type==='input').props.onChange({target:{value:'345'}});setup.setData({airport:'ELP',budget:200});setup.render();setup.effect();tree=setup.render();assert.equal(nodes(tree).find(n=>n.type==='input').props.value,'345');
});
test('plans keep expired estimates votable but close stale, failed and final ballots',()=>{
  for(const status of ['stale','failed','final']){
    const data=trip(status);const h=harness('app/travel/[id]/plans/page.tsx',data);const tree=h.render();h.effect();
    assert.equal(nodes(tree).find(n=>n.type==='cards').props.voting,false);assert.equal(h.calls.length,0);
    assert.ok(nodes(tree).some(n=>n.type==='a'&&n.props.href===(status==='final'?'/travel/5/final':'/travel/5/finding')));
  }
  const open=harness('app/travel/[id]/plans/page.tsx',trip('voting',{expired:true}));const tree=open.render();
  assert.equal(nodes(tree).find(n=>n.type==='cards').props.voting,true);assert.match(text(tree),/0 of 2 have voted/);
  assert.equal(nodes(tree).find(n=>n.type==='fare-warning').props.expired,true);
});
test('dedicated final shows only winner, retains expired choice, never votes or claims lowest cost',()=>{
  const h=harness('app/travel/[id]/final/page.tsx',trip('final',{expired:true,winnerId:2}));const tree=h.render();const cards=nodes(tree).find(n=>n.type==='cards');assert.equal(cards.props.options.length,1);assert.equal(cards.props.options[0].id,2);assert.equal(cards.props.voting,false);assert.equal(cards.props.showRecommendation,false);assert.match(text(tree),/Fares expired\. Recheck before booking/);assert.equal(h.calls.length,0);
  assert.ok(click(tree,'Not feeling it? Ask for new options'));assert.equal(nodes(tree).some(n=>n.type==='a'&&n.props.href==='/travel/5/finding'),false);assert.ok(!text(tree).includes('Vote on'));
});
test('dashboard partitions voting trips with no inline create or join; demo remains secondary',()=>{
  const list=[{id:5,name:'Vote',members:2,ready:2,setupDone:true,phase:'voting',myVoted:false},{id:4,name:'Final',members:2,ready:2,setupDone:true,phase:'final'},{id:3,name:'Setup',members:2,ready:1,setupDone:false,phase:'setup'}];
  const h=harness('app/travel/page.tsx',list);let tree=h.render();assert.equal(nodes(tree).filter(n=>n.type==='article').length,2);assert.ok(nodes(tree).some(n=>n.props?.['aria-label']==='Trips with voting open'));assert.ok(nodes(tree).some(n=>n.type==='a'&&n.props.href==='/travel/3/setup'));
  assert.equal(nodes(tree).filter(n=>n.type==='form').length,0);assert.equal(nodes(tree).filter(n=>n.type==='input'&&n.props.type==='search').length,0);assert.ok(nodes(tree).some(n=>n.type==='button'&&n.props['aria-label']==='Search trips'));assert.ok(!nodes(tree).some(n=>n.type==='a'&&n.props.href==='/travel/new'));
  const empty=harness('app/travel/page.tsx',[]);assert.match(text(empty.render()),/No trips yet/);
});
const tick=()=>new Promise(r=>setTimeout(r,0));
const typeName=(h,value='Reunion')=>nodes(h.render()).find(n=>n.type==='input'&&n.props['aria-label']==='Trip name').props.onChange({target:{value}});
const createForm=tree=>nodes(tree).find(n=>n.type==='form'&&n.props['aria-label']==='Create trip');
const joinGroup=tree=>nodes(tree).find(n=>n.type==='section'&&n.props['aria-labelledby']==='join-trip-heading');
const joinButton=tree=>nodes(tree).find(n=>n.type==='button'&&text(n)==='Join');
const typeCode=(h,code,complete)=>nodes(h.render()).find(n=>n.type==='invite').props.onChange(code,complete);
test('create goes to private setup; no top mode switches remain and bottom Travel navigation stays',async()=>{
  const h=harness('app/travel/new/page.tsx',null);h.setRespond(async()=>({id:8}));typeName(h);await createForm(h.render()).props.onSubmit({preventDefault(){}});assert.deepEqual(h.routes,['/travel/8/setup']);
  assert.equal(h.calls[0][0],'/api/travel');assert.equal(h.calls[0][2].name,'Reunion');
  for(const file of ['components/TravelUI.tsx','app/groups/page.tsx'])assert.ok(!fs.readFileSync(file,'utf8').includes('aria-label="WSP mode"'));
  assert.ok(fs.readFileSync('components/TabBar.tsx','utf8').includes('{ href: "/travel", label: "Travel" }'));
});
test('Start a trip mirrors Start a group: back to /travel, title, trip name and dates, then the code box with Join',async()=>{
  const h=harness('app/travel/new/page.tsx',null);const tree=h.render();
  assert.equal(nodes(tree).find(n=>n.type==='back').props.href,'/travel');
  assert.equal(text(nodes(tree).find(n=>n.type==='h1')),'Start a trip');
  assert.ok(nodes(createForm(tree)).some(n=>n.type==='editor'),'dates are in the create form');
  assert.equal(nodes(joinGroup(tree)).some(n=>n.type==='editor'),false);
  assert.equal(text(nodes(joinGroup(tree)).find(n=>n.type==='h2')),'OR JOIN WITH A CODE','a plain label at the top of the join card, no divider lines');
  assert.match(joinGroup(tree).props.className,/rounded-3xl bg-pistachio p-5/);assert.match(joinButton(tree).props.className,/\bbg-panel\b/);assert.match(joinButton(tree).props.className,/\btext-white\b/);assert.ok(!/bg-pistachio/.test(joinButton(tree).props.className));
  const invite=nodes(tree).find(n=>n.type==='invite');assert.equal(invite.props.value,'TRIP-');assert.equal(invite.props.spec,inviteLib.TRAVEL_CODE);
  assert.ok(nodes(tree).some(n=>n.type==='button'&&text(n)==='Create trip'&&n.props.form==='create-trip'),'sticky Create trip button submits the create form');
});
test('Join stays off until the TRIP code is complete, then joins and routes by own setup',async()=>{
  for(const setupDone of [false,true]){
    const h=harness('app/travel/new/page.tsx',null);let tree=h.render();
    assert.equal(joinButton(tree).props.disabled,true);
    typeCode(h,'TRIP-ABCDEF12',false);assert.equal(joinButton(h.render()).props.disabled,true);
    typeCode(h,'TRIP-ABCDEF123456',true);tree=h.render();assert.equal(joinButton(tree).props.disabled,false);
    h.setRespond(async()=>({id:7,setupDone}));joinButton(tree).props.onClick();await tick();
    assert.deepEqual(h.routes,[setupDone?'/travel/7':'/travel/7/setup']);assert.equal(JSON.stringify(h.calls[0]),JSON.stringify(['/api/travel/join','POST',{code:'TRIP-ABCDEF123456'}]));
  }
});
test('create and join errors stay in their own places; shared busy guard prevents duplicate requests',async()=>{
  const h=harness('app/travel/new/page.tsx',null);
  h.setRespond(async()=>{throw Error('Invite not found');});typeCode(h,'TRIP-ABCDEF123456',true);joinButton(h.render()).props.onClick();await tick();
  let tree=h.render();assert.match(text(joinGroup(tree)),/Invite not found/);assert.ok(!text(createForm(tree)).includes('Invite not found'));
  typeName(h);nodes(h.render()).find(n=>n.type==='editor').props.onChange({depart:'invalid',return:'invalid'});await createForm(h.render()).props.onSubmit({preventDefault(){}});
  tree=h.render();assert.match(text(createForm(tree)),/Choose a future departure/);assert.equal(h.calls.length,1);
  let release;h.setRespond(()=>new Promise(r=>release=r));tree=h.render();joinButton(tree).props.onClick();joinButton(tree).props.onClick();createForm(tree).props.onSubmit({preventDefault(){}});
  assert.equal(h.calls.length,2);tree=h.render();assert.ok(nodes(tree).filter(n=>n.type==='button').every(n=>n.props.disabled));release({id:5,setupDone:false});await tick();
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


test('votes are optimistic, rolled back on failure, and confirmed ballots lock controls',async()=>{
  const h=harness('app/travel/[id]/plans/page.tsx',trip('voting'));
  let release;h.setRespond(()=>new Promise(r=>release=r));
  const pending=nodes(h.render()).find(n=>n.type==='cards').props.onVote(1,'approve');
  let tree=h.render();assert.deepEqual(JSON.parse(JSON.stringify(nodes(tree).find(n=>n.type==='cards').props.myVotes)),[{optionId:1,value:'approve'}]);
  assert.equal(click(tree,'Saving…').props.disabled,true);
  h.setData(trip('voting',{myVotes:[{optionId:1,value:'approve'}],voted:1}));release({ok:true});await pending;
  tree=h.render();assert.match(text(tree),/1 of 2 have voted/);
  h.setRespond(async()=>{throw Error('Vote failed');});await nodes(tree).find(n=>n.type==='cards').props.onVote(2,'approve');
  tree=h.render();assert.match(text(tree),/Vote failed/);assert.equal(nodes(tree).find(n=>n.type==='cards').props.myVotes.length,1);
  h.setData(trip('voting',{myConfirmed:true,confirmed:1}));tree=h.render();assert.equal(nodes(tree).find(n=>n.type==='cards').props.voting,false);assert.equal(click(tree,'Confirm my votes'),undefined);
});
test('majority-removed options disappear; explicit confirm uses comparison snapshot',async()=>{
  const h=harness('app/travel/[id]/plans/page.tsx',trip('voting',{removedOptionIds:[2],myVotes:[{optionId:1,value:'approve'}],canConfirm:true}));
  const tree=h.render();assert.equal(nodes(tree).find(n=>n.type==='cards').props.options.length,1);assert.match(text(tree),/removed by majority veto/);
  await click(tree,'Confirm my votes').props.onClick();assert.equal(h.calls[0][0],'/api/travel/5/confirm');assert.equal(h.calls[0][2].comparisonId,11);
});
test('saved final survives replacement failure and confirmed final hides redraw',async()=>{
  const data=trip('failed');data.savedFinal={...trip('final',{winnerId:2}).comparison,id:10};
  const h=harness('app/travel/[id]/final/page.tsx',data);let tree=h.render();assert.equal(nodes(tree).find(n=>n.type==='cards').props.options[0].id,2);assert.match(text(tree),/new search failed\. This pick is still saved/);
  await click(tree,'Not feeling it? Ask for new options').props.onClick();assert.equal(h.calls[0][0],'/api/travel/5/redraw');assert.equal(h.calls[0][2].comparisonId,10);
  data.savedFinal.confirmedAt=new Date().toISOString();data.savedFinal.redraw.locked=true;h.setData(data);tree=h.render();assert.equal(click(tree,'Not feeling it? Ask for new options'),undefined);assert.equal(click(tree,'Confirm this meeting place'),undefined);
});
test('dashboard routes final directly and filters trip search',()=>{
  const h=harness('app/travel/page.tsx',[{id:4,name:'Final',members:2,ready:2,setupDone:true,phase:'final'},{id:3,name:'Setup',members:2,ready:1,setupDone:false,phase:'setup'}]);
  let tree=h.render();assert.ok(nodes(tree).some(n=>n.type==='a'&&n.props.href==='/travel/4/final'));
  nodes(tree).find(n=>n.type==='button'&&n.props['aria-label']==='Search trips').props.onClick();tree=h.render();nodes(tree).find(n=>n.type==='input').props.onChange({target:{value:'Final'}});tree=h.render();assert.ok(!nodes(tree).some(n=>n.type==='a'&&n.props.href==='/travel/3/setup'));
});
test('flight comfort presets set a real private dollar cap without forcing the default',()=>{
  const h=harness('app/travel/[id]/setup/page.tsx',{airport:'ELP',budget:null});h.render();h.effect();let tree=h.render();
  assert.equal(nodes(tree).find(n=>n.type==='input').props.value,'');
  const preset=nodes(tree).find(n=>n.type==='button'&&text(n).includes('$400'));preset.props.onClick();tree=h.render();assert.equal(nodes(tree).find(n=>n.type==='input').props.value,'400');
  assert.equal(nodes(tree).filter(n=>n.type==='button'&&n.props['aria-pressed']!==undefined).length,3);
});


test('Travel dashboard uses the Hangout featured card layout and saved-final recovery',()=>{
  const h=harness('app/travel/page.tsx',[{id:1,name:'bruh',members:2,ready:2,setupDone:true,phase:'failed',hasSavedFinal:true}]);
  const tree=h.render();assert.equal(tree.type,'page');assert.equal(tree.props.variant,'plain');
  const heading=nodes(tree).find(n=>n.type==='h1');assert.equal(text(heading),'Trips');assert.ok(heading.props.className.includes('text-[36px]'));
  const card=nodes(tree).find(n=>n.type==='article');assert.ok(card.props.className.includes('bg-pistachio'));
  assert.ok(nodes(card).some(n=>n.props?.className?.includes('h-[84px]')&&n.props.className.includes('bg-matcha')));
  assert.ok(nodes(card).some(n=>n.type==='smiley'&&n.props.size===48));
  assert.match(text(card),/FINAL/);assert.ok(nodes(card).some(n=>n.type==='a'&&n.props.href==='/travel/1/final'&&text(n).includes('View trip')));
  assert.equal(nodes(tree).some(n=>n.type==='a'&&n.props.href==='/travel/new'),false);
});
test('Travel dashboard search closes with Escape and vote shortcuts distinguish confirmed ballots',()=>{
  const h=harness('app/travel/page.tsx',[{id:5,name:'Reunion',members:2,ready:2,setupDone:true,phase:'voting',myVoted:true,myConfirmed:true}]);
  let tree=h.render();assert.ok(nodes(tree).some(n=>n.type==='section'&&n.props['aria-label']==='Current votes'));
  assert.ok(nodes(tree).some(n=>n.type==='a'&&n.props['aria-label']?.includes('your votes are confirmed')));
  assert.ok(!text(tree).includes('Vote now'));
  nodes(tree).find(n=>n.type==='button'&&n.props['aria-label']==='Search trips').props.onClick();tree=h.render();
  nodes(tree).find(n=>n.type==='input').props.onChange({target:{value:'missing'}});tree=h.render();assert.match(text(tree),/No trips match/);
  nodes(tree).find(n=>n.props?.role==='search').props.onKeyDown({key:'Escape',preventDefault(){}});tree=h.render();assert.equal(nodes(tree).some(n=>n.type==='input'),false);assert.ok(nodes(tree).some(n=>n.type==='article'));
});

// ---- Copy: every screen keeps only state, numbers, next steps and safety facts. These pin what was removed and the short wording.
const screen=(file,data)=>{const h=harness(file,data);const tree=h.render();return {tree,txt:text(tree)};};
const has=(tree,tag)=>nodes(tree).some(n=>n.type===tag);
test('copy: the notice is on the final page only, and new trip uses the frame back button',()=>{
  assert.equal(has(screen('app/travel/[id]/final/page.tsx',trip('final')).tree,'notice'),true);
  for(const file of ['app/travel/new/page.tsx','app/travel/[id]/page.tsx','app/travel/[id]/plans/page.tsx','app/travel/[id]/finding/page.tsx']) assert.equal(has(screen(file,file.includes('new')?null:trip('voting')).tree,'notice'),false,file);
  const created=screen('app/travel/new/page.tsx',null);
  assert.equal(nodes(created.tree).find(n=>n.type==='back').props.href,'/travel');assert.ok(!/Back to trips|Try the demo/.test(created.txt));
});
test('copy: final page is the title, the pick, short status lines and the redraw count',()=>{
  const { txt }=screen('app/travel/[id]/final/page.tsx',trip('final',{expired:true,settingsChanged:true,confirmedAt:null}));
  assert.ok(!/Final choice|The group has a meeting place|Your decision is saved|A majority must agree/.test(txt),txt);
  assert.match(txt,/Fares expired\. Recheck before booking\./);assert.match(txt,/Trip settings changed since this pick\./);
  assert.match(txt,/0 of 2 want new options · 2 needed/);
  assert.match(screen('app/travel/[id]/final/page.tsx',trip('final',{confirmedAt:'2026-10-25T00:00:00Z'})).txt,/Meeting place confirmed\./);
  assert.ok(!/New searches are locked/.test(screen('app/travel/[id]/final/page.tsx',trip('final',{confirmedAt:'2026-10-25T00:00:00Z'})).txt));
  const data=trip('voting');data.savedFinal={...trip('final').comparison,id:10};
  assert.match(screen('app/travel/[id]/final/page.tsx',data).txt,/A new round is in progress\. This pick stays until a new one wins\./);
});
test('copy: plans drop the anonymity paragraph and use short closed-state and confirm lines',()=>{
  const open=screen('app/travel/[id]/plans/page.tsx',trip('voting')).txt;
  assert.ok(!/anonymous|Voting closes when everyone confirms/.test(open),open);assert.match(open,/Voted on 0 of 2 · confirmed votes are final/);
  const closed={final:'Voting closed. Meeting place picked.',vetoed:'No destination won. Try new options.',stale:'Trip changed. A new search is needed.',generating:'Flight search in progress.'};
  for(const [status,line] of Object.entries(closed)) assert.match(screen('app/travel/[id]/plans/page.tsx',trip(status)).txt,new RegExp(line.replace(/[.]/g,'\\.')),status);
  const confirmed=trip('voting',{myConfirmed:true});assert.match(screen('app/travel/[id]/plans/page.tsx',confirmed).txt,/Votes confirmed\. Waiting for the group\./);
  const dated=trip('voting');dated.dates={...dated.dates,depart:'2026-11-24',return:'2026-11-27'};
  assert.match(screen('app/travel/[id]/plans/page.tsx',dated).txt,/Reunion · Nov 24 – 27|Reunion · Nov 24 – 27, 2026/);
});
test('copy: lobby drops its explainers and the extra All trips link, with short phase lines',()=>{
  const lobby=screen('app/travel/[id]/page.tsx',trip());assert.ok(!/All trips|No destination to pick yet|Everyone has added|Everyone needs an airport/.test(lobby.txt),lobby.txt);
  assert.ok(!nodes(lobby.tree).some(n=>n.type==='a'&&n.props.href==='/travel'));
  const lines={failed:'Last search failed. The organizer can retry.',stale:'Trip changed. Run a new search.',vetoed:'No destination won. Try new dates.'};
  for(const [status,line] of Object.entries(lines)) assert.ok(screen('app/travel/[id]/page.tsx',trip(status)).txt.includes(line),status);
  assert.ok(screen('app/travel/[id]/page.tsx',trip('final',{confirmedAt:'2026-10-25T00:00:00Z'})).txt.includes('Meeting place confirmed. Dates are locked.'));
});
test('copy: setup is the airport, the max fare, one privacy line and the budget-connection link',()=>{
  const { txt,tree }=screen('app/travel/[id]/setup/page.tsx',{airport:'AUS',budget:300});
  assert.ok(!/Everyone fills this out|not a suggested spend|Flights only|A private budget check|Changes require a new comparison/.test(txt),txt);
  assert.match(txt,/Your max round-trip fare/);assert.match(txt,/Only you see this number\./);
  assert.ok(nodes(tree).some(n=>n.type==='a'&&n.props.href==='/spending'&&text(n)==='Manage my budget connection'));
});
test('copy: finding shows short status lines and has no status button or back link (the page polls)',()=>{
  const gen=screen('app/travel/[id]/finding/page.tsx',trip('generating'));
  assert.ok(gen.txt.includes('Searching fares. This can take up to 3 minutes; you can leave this page.'));
  assert.ok(!/Discovering destinations|Check search status|Back to trip lobby|Opening this page does not start/.test(gen.txt),gen.txt);
  assert.equal(click(gen.tree,'Check search status'),undefined);
  const member=trip();member.organizer=false;assert.ok(screen('app/travel/[id]/finding/page.tsx',member).txt.includes('Waiting for the organizer’s search.'));
  const notReady=trip();notReady.members=[{id:1,name:'Steph',airport:'ELP',ready:true},{id:2,name:'Tony',airport:null,ready:false}];
  assert.ok(screen('app/travel/[id]/finding/page.tsx',notReady).txt.includes('Waiting for everyone’s setup.'));
  assert.ok(screen('app/travel/[id]/finding/page.tsx',trip('voting')).txt.includes('A vote is already open.'));
  assert.ok(screen('app/travel/[id]/finding/page.tsx',trip('final',{confirmedAt:'2026-10-25T00:00:00Z'})).txt.includes('Confirmed. New searches are locked.'));
});
test('setup: chips show their own dollar amounts and the basis line; the fixed fallback has no line; the limit input has a $',()=>{
  const live=screen('app/travel/[id]/setup/page.tsx',{airport:'ELP',budget:null,suggestions:{light:30,room:70,flex:120,available:350.4}});
  assert.match(live.txt,/\$30Keep it light/);assert.match(live.txt,/\$70A little room/);assert.match(live.txt,/\$120More flexibility/);
  assert.match(live.txt,/Based on your \$350 available\./);
  assert.ok(nodes(live.tree).some(n=>n.type==='span'&&n.props['aria-hidden']==='true'&&text(n)==='$'),'$ adornment inside the limit input');
  for(const none of [null,undefined]){
    const fixed=screen('app/travel/[id]/setup/page.tsx',{airport:'ELP',budget:null,suggestions:none});
    assert.match(fixed.txt,/\$200Keep it light/);assert.match(fixed.txt,/\$700More flexibility/);assert.ok(!/Based on your/.test(fixed.txt));
  }
});
test('scope: the create page defaults to National and sends the chosen scope; the lobby shows it and the organizer can change it',async()=>{
  const h=harness('app/travel/new/page.tsx',null);let tree=h.render();
  const picker=nodes(tree).find(n=>n.type==='scope');assert.equal(picker.props.value,'national');
  picker.props.onChange('state');tree=h.render();assert.equal(nodes(tree).find(n=>n.type==='scope').props.value,'state');
  typeName(h);h.setRespond(async()=>({id:8}));await createForm(h.render()).props.onSubmit({preventDefault(){}});
  assert.equal(h.calls[0][2].dates.scope,'state');
  const lobby=screen('app/travel/[id]/page.tsx',trip(null,{}));
  assert.match(lobby.txt,/When you’ll meet.*· National/);
  const lh=harness('app/travel/[id]/page.tsx',{...trip(null),dates:{...trip(null).dates,scope:'global'}});let lt=lh.render();
  assert.match(text(lt),/· Global/);
  lh.effect();lt=lh.render();nodes(lt).find(n=>n.type==='button'&&text(n)==='Edit shared dates').props.onClick();lt=lh.render();
  const edit=nodes(lt).find(n=>n.type==='scope');assert.equal(edit.props.value,'global');
});
