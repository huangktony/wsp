import { toggleBallot, ballotComplete, winner, type Option, type Ballot, type Vote, type Quote } from './core';
import { defaultDates,readDates,validateDates,discoveryShortlist,qualifyDestinations,type DiscoveryDates } from './discovery';
export const DEMO_MEMBERS = [{ id:1,name:'Steph',airport:'ELP' },{ id:2,name:'Tony',airport:'IAH' },{ id:3,name:'Ravi',airport:'ORD' }];
// Synthetic caps are illustration-only, never a real user's preferences or financial data.
const SAMPLE_CAPS = [220,240,270];
export type DemoState = { dates: DiscoveryDates; voter:number; ballots:Ballot[]; status:'voting'|'final'|'vetoed'; winnerId:number|null };
export const initialDemo = (): DemoState => ({ dates:defaultDates(),voter:1,ballots:[],status:'voting',winnerId:null });
export function demoDiscovery(value: unknown) {
  const dates=readDates(value)??defaultDates();
  const candidates=discoveryShortlist(DEMO_MEMBERS.map(m=>m.airport),dates);
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
export function demoVote(state:DemoState,optionId:number,value:Vote):DemoState{
  const options=demoOptions(state.dates);
  if(state.status!=='voting'||!options.some(o=>o.id===optionId))return state;
  const ballots=toggleBallot(state.ballots,state.voter,optionId,value);
  if(!ballotComplete(options,ballots,DEMO_MEMBERS.map(m=>m.id)))return {...state,ballots};
  const winnerId=winner(options,ballots);
  return {...state,ballots,winnerId,status:winnerId===null?'vetoed':'final'};
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
    const complete=ballotComplete(options,ballots,[1,2,3]),winnerId=complete?winner(options,ballots):null;
    return {dates,ballots,voter:x.voter,winnerId,status:complete?winnerId===null?'vetoed':'final':'voting'};
  }catch{return initialDemo();}
}
