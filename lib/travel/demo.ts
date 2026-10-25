import { ballotProgress } from "./ballot";
import { toggleBallot, type Option, type Ballot, type Vote, type Quote } from './core';
import { defaultDates,readDates,validateDates,qualifyDestinations,type DiscoveryDates } from './discovery';
export const DEMO_MEMBERS = [{ id:1,name:'Steph',airport:'ELP' },{ id:2,name:'Tony',airport:'IAH' },{ id:3,name:'Ravi',airport:'ORD' }];
// Synthetic caps are illustration-only, never a real user's preferences or financial data.
const SAMPLE_CAPS = [220,240,270];
export type DemoState = { dates: DiscoveryDates; voter:number; ballots:Ballot[]; confirmed:number[]; status:'voting'|'final'|'vetoed'; winnerId:number|null };
export const initialDemo = (): DemoState => ({ dates:defaultDates(),voter:1,ballots:[],confirmed:[],status:'voting',winnerId:null });
export function demoDiscovery(value: unknown) {
  const dates=readDates(value)??defaultDates();
  // Stable illustrative destinations; live recommendations use origin-adaptive discovery.
  const candidates=['AUS','DEN','ATL','DFW','SEA','MCO'].map((airport,i)=>({id:i+1,airport,depart:dates.depart,return:dates.return}));
  const quotes=new Map<string,Quote>();
  for(const option of candidates)for(const [i,member] of DEMO_MEMBERS.entries()){
    const local=member.airport===option.airport;
    const prices=option.airport==='AUS'?[120,110,180]:option.airport==='DEN'?[180,210,250]:[290,310,350];
    quotes.set(`${member.airport}/${option.id}`,{ origin:member.airport,destination:option.airport,depart:dates.depart,return:dates.return,price:local?0:prices[i],local,airlines:['Sample airline'],stops:0,duration:null,quotedAt:'Sample fares — not a live quote',source:'sample' });
  }
  const result=qualifyDestinations(candidates,DEMO_MEMBERS.map((m,i)=>({...m,cap:SAMPLE_CAPS[i],funds:{available:null,checkedAt:Date.now(),source:'simulated' as const}})),quotes);
  // Demo green is explicitly simulated, after the same strict cap qualification used by real discovery.
  return {...result,options:result.options.map(o=>({...o,routes:o.routes.map(r=>({...r,check:true,checkSource:'simulated' as const}))}))};
}
export function demoOptions(dates:unknown):Option[]{return demoDiscovery(dates).options;}
export function demoProgress(state: DemoState) {
  return ballotProgress(demoOptions(state.dates),state.ballots,[1,2,3],{ deadline:'',confirmed:state.confirmed,redraw:[],finalConfirmedAt:null },state.voter);
}
function settleDemo(state: DemoState): DemoState {
  const progress=demoProgress(state);
  const closed=progress.remaining===0||progress.confirmed===3;
  return {...state,winnerId:closed?progress.winner:null,status:closed?progress.winner===null?'vetoed':'final':'voting'};
}
export function demoVote(state:DemoState,optionId:number,value:Vote):DemoState{
  const progress=demoProgress(state);
  if(state.status!=='voting'||progress.myConfirmed||progress.removedOptionIds.includes(optionId)||!demoOptions(state.dates).some(o=>o.id===optionId))return state;
  return settleDemo({...state,ballots:toggleBallot(state.ballots,state.voter,optionId,value)});
}
export function demoConfirm(state:DemoState):DemoState{
  if(state.status!=='voting'||!demoProgress(state).canConfirm)return state;
  return settleDemo({...state,confirmed:[...state.confirmed,state.voter]});
}
export function restoreDemo(raw:string):DemoState{
  try{
    const x=JSON.parse(raw),dates=validateDates(x.dates);
    if(![1,2,3].includes(x.voter)||!Array.isArray(x.ballots)||x.ballots.length>9)return initialDemo();
    const options=demoOptions(dates),ballots:Ballot[]=[];
    for(const b of x.ballots){
      if(![1,2,3].includes(b.userId)||!options.some(o=>o.id===b.optionId)||!['approve','veto'].includes(b.value)||ballots.some(v=>v.userId===b.userId&&v.optionId===b.optionId))return initialDemo();
      ballots.push({userId:b.userId,optionId:b.optionId,value:b.value});
    }
    const confirmed=Array.isArray(x.confirmed)?[...new Set<number>(x.confirmed.filter((id:unknown)=>typeof id==='number'&&[1,2,3].includes(id)))]:[];
    const restored:DemoState={dates,ballots,voter:x.voter,confirmed:[],winnerId:null,status:'voting'};
    // Persisted confirmation is accepted only with a complete ballot.
    restored.confirmed=confirmed.filter(id=>demoProgress({...restored,voter:id}).canConfirm);
    return settleDemo(restored);
  }catch{return initialDemo();}
}
