// Pure discovery rules shared by the server and synthetic demo. No I/O or private data returned.
import { AIRPORTS, FARE_TTL, TravelInputError, airportRegion, validAirport, validHomeAirport, validDay, type TripScope, type Candidate, type Option, type Route, type Quote } from './core';
import { budgetCheck, type Financial } from './finance';
export type DiscoveryDates = { version: 1; mode: 'discover'; depart: string; return: string; scope: TripScope };
export type DiscoverySummary = { searchedCount: number; qualifiedCount: number; returnedCount: number };
export const SEARCH_LEASE_MS = 150000;
export function defaultDates(now = new Date()): DiscoveryDates {
  const day = (offset: number) => new Date(now.getTime() + offset * 864e5).toISOString().slice(0, 10);
  return { version: 1, mode: 'discover', depart: day(30), return: day(33), scope: 'national' };
}
/** Old candidate arrays use the first option's dates. Reading past final trips must not revalidate against today. */
export function readDates(value: unknown): DiscoveryDates | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || typeof raw !== 'object') return null;
  const x = raw as Record<string, unknown>;
  if (!Array.isArray(value) && (x.mode !== undefined && x.mode !== 'discover' || x.version !== undefined && x.version !== 1)) return null;
  if (!validDay(x.depart) || !validDay(x.return) || x.return <= x.depart) return null;
  // Trips saved before scope existed read as National. An unknown scope is rejected, not guessed.
  if (x.scope !== undefined && x.scope !== 'state' && x.scope !== 'national' && x.scope !== 'global') return null;
  return { version: 1, mode: 'discover', depart: x.depart, return: x.return, scope: (x.scope as TripScope | undefined) ?? 'national' };
}
export function validateDates(value: unknown, now = new Date()): DiscoveryDates {
  const dates = readDates(value);
  if (!dates || dates.depart <= now.toISOString().slice(0, 10)) throw new TravelInputError('Choose a future departure and a later return date.');
  if (new Date(dates.return).getTime() - now.getTime() > 365 * 864e5) throw new TravelInputError('Choose dates within the next year.');
  return dates;
}
// Approximate airport coordinates, used only to choose a bounded geographic sample.
// Distances are not fares, scheduled flight times, or claims of direct service.
const geography: Record<string, readonly [number, number]> = {
  AUS:[30.2,-97.7], DEN:[39.9,-104.7], ELP:[31.8,-106.4], IAH:[30.0,-95.3],
  ORD:[42.0,-87.9], ATL:[33.6,-84.4], BOS:[42.4,-71.0], CLT:[35.2,-80.9],
  DFW:[32.9,-97.0], DTW:[42.2,-83.4], EWR:[40.7,-74.2], IAD:[38.9,-77.5],
  JFK:[40.6,-73.8], LAS:[36.1,-115.2], LAX:[33.9,-118.4], MCO:[28.4,-81.3],
  MIA:[25.8,-80.3], MSP:[44.9,-93.2], PDX:[45.6,-122.6], PHL:[39.9,-75.2],
  PHX:[33.4,-112.0], SAN:[32.7,-117.2], SEA:[47.4,-122.3], SFO:[37.6,-122.4], SLC:[40.8,-112.0],
  SAT:[29.5,-98.5], HOU:[29.6,-95.3], DAL:[32.8,-96.9], OAK:[37.7,-122.2], SJC:[37.4,-121.9],
  SMF:[38.7,-121.6], BUR:[34.2,-118.4], FLL:[26.1,-80.2], TPA:[28.0,-82.5], LGA:[40.8,-73.9],
  CUN:[21.0,-86.9], MEX:[19.4,-99.1], PVR:[20.7,-105.3], YYZ:[43.7,-79.6], YVR:[49.2,-123.2],
  LHR:[51.5,-0.5], CDG:[49.0,2.5], FCO:[41.8,12.2], BCN:[41.3,2.1], HND:[35.5,139.8], ICN:[37.5,126.4], SJO:[10.0,-84.2],
};
const hubs = new Set(['ATL','ORD','DFW','DEN','IAH','CLT','DTW','MSP','SLC','PHX','LAX','SFO','SEA','EWR','JFK','IAD','MIA']);
function distance(a: string, b: string) {
  const [lat1,lon1] = geography[a], [lat2,lon2] = geography[b];
  const rad = Math.PI / 180;
  const h = Math.sin((lat2-lat1)*rad/2)**2 + Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin((lon2-lon1)*rad/2)**2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1,h)));
}
/** Geographic heuristic only: balance average and longest distance, with a modest hub preference.
 * Reserve up to two member cities (most members first), then fill from the geographic ranking.
 * Previous rejected destinations stay excluded, even when the supported pool is exhausted.
 * Never search more than six destinations or eight travelers; actual quotes decide affordability.
 */
export function discoveryShortlist(origins: string[], dates: DiscoveryDates, excludedAirports: string[] = []): Candidate[] {
  if (!origins.length || origins.length > 8 || origins.some(o => !validHomeAirport(o))) throw new TravelInputError('Every traveler needs a supported home airport.');
  const excluded = new Set(excludedAirports.filter(validAirport));
  const counts = new Map<string,number>();
  for (const origin of origins) counts.set(origin,(counts.get(origin)??0)+1);
  const score = (airport: string) => {
    const lengths = origins.map(origin => distance(origin,airport));
    return lengths.reduce((a,b)=>a+b,0)/lengths.length + .65*Math.max(...lengths) - (hubs.has(airport)?100:0);
  };
  // The scope picks the pool: in-state is any traveler's home state, national is every US airport, global is international only.
  const states = new Set(origins.map(o => airportRegion(o)));
  const inScope = ([, , region, country]: readonly [string, string, string, string]) =>
    dates.scope === 'global' ? country !== 'US' : country === 'US' && (dates.scope !== 'state' || states.has(region));
  const pool = AIRPORTS.filter(inScope).map(([airport])=>airport).filter(airport=>!origins.every(o=>o===airport));
  if (!pool.length) throw new TravelInputError('Not enough airports in your state. Try National.');
  const inPool = new Set(pool);
  const ranked = pool.filter(airport=>!excluded.has(airport)).sort((a,b)=>score(a)-score(b)||a.localeCompare(b));
  const memberCities = counts.size > 1 ? [...counts].filter(([airport])=>inPool.has(airport)&&!excluded.has(airport)).sort((a,b)=>b[1]-a[1]||score(a[0])-score(b[0])||a[0].localeCompare(b[0])).slice(0,2).map(([airport])=>airport) : [];
  const selected = [...new Set([...memberCities,...ranked])].slice(0,6);
  return selected.sort((a,b)=>score(a)-score(b)||a.localeCompare(b)).map((airport,i)=>({id:i+1,airport,depart:dates.depart,return:dates.return}));
}

/** Choose distinct useful tradeoffs from eligible quotes. Fare checks never use these scores. */
export function recommendDestinations(qualified: Option[]): Option[] {
  if (!qualified.length) return [];
  const byCost = [...qualified].sort((a,b)=>a.total!-b.total!||a.airport.localeCompare(b.airport)||a.id-b.id);
  const selected: Option[] = [];
  const add = (option: Option, kind: NonNullable<Option['recommendation']>['kind'], label: string, reason: string) => {
    if (!selected.some(o=>o.id===option.id)) selected.push({...option,recommendation:{kind,label,reason}});
  };
  add(byCost[0],'lowest-cost','Lowest group cost','Lowest total round-trip fare among destinations that fit everyone in this search.');
  const metricsKnown = byCost.every(o=>o.routes.every(r=>r.local || (r.duration!==null && Number.isFinite(r.duration) && r.duration>0 && r.stops!==null && Number.isInteger(r.stops) && r.stops>=0)));
  if (metricsKnown) {
    const worst = (o: Option) => Math.max(...o.routes.map(r=>r.local?0:r.duration!));
    const stops = (o: Option) => o.routes.reduce((sum,r)=>sum+(r.local?0:r.stops!),0);
    const easy = [...byCost].sort((a,b)=>worst(a)-worst(b)||stops(a)-stops(b)||a.total!-b.total!||a.airport.localeCompare(b.airport))[0];
    add(easy,'easiest-travel','Shortest longest flight',`Shortest longest outbound itinerary in this search: ${worst(easy)} minutes. Return-trip durations are not compared.`);
  }
  const highest = (o: Option) => Math.max(...o.routes.map(r=>r.price!));
  const maxTotal = Math.max(...byCost.map(o=>o.total!));
  const maxFare = Math.max(...byCost.map(highest));
  const balance = (o: Option) => .5*o.total!/maxTotal + .5*highest(o)/maxFare;
  const balanced = [...byCost].sort((a,b)=>balance(a)-balance(b)||a.total!-b.total!||a.airport.localeCompare(b.airport))[0];
  add(balanced,'balanced','Balanced flight costs','Balances the group total and the highest individual round-trip fare among eligible destinations.');
  for (const option of byCost) {
    if (selected.length >= 3) break;
    add(option,'alternative','Another budget fit','Another destination that fits everyone, ordered by total round-trip fare.');
  }
  return selected.slice(0,3);
}
export type DiscoveryTraveler = { id: number; name: string; airport: string; cap: number; funds: Financial };
/** Reject before persistence: group-total cheapness can never conceal a member's over-cap route.
 * Candidates with complete, fresh fares that failed only on a cap or the funds check are kept apart. They are used only when
 * nothing fits anyone: then the three cheapest open voting as fits:false, with no per-person check, so no one can tell whose limit was exceeded.
 */
export function qualifyDestinations(candidates: Candidate[], travelers: DiscoveryTraveler[], quotes: Map<string,Quote>, now = Date.now()): { options: Option[]; summary: DiscoverySummary } {
  const qualified: Option[] = [], overBudget: Option[] = [];
  for (const candidate of candidates) {
    const routes: Route[] = [];
    let usable = true, over = false;
    for (const member of travelers) {
      const quote = quotes.get(`${member.airport}/${candidate.id}`);
      if (!quote || quote.origin !== member.airport || quote.destination !== candidate.airport || quote.depart !== candidate.depart || quote.return !== candidate.return ||
          (quote.source!=='sample' && (!Number.isFinite(Date.parse(quote.quotedAt)) || now-Date.parse(quote.quotedAt)<0 || now-Date.parse(quote.quotedAt)>=FARE_TTL)) ||
          quote.local !== (quote.origin === quote.destination) || quote.price === null || !Number.isFinite(quote.price) || (quote.local ? quote.price !== 0 || quote.origin !== quote.destination : quote.price <= 0) ||
          !Number.isFinite(member.cap) || member.cap < 0.01) { usable = false; break; }
      if (quote.price > member.cap) over = true;
      const check = budgetCheck(quote.price,member.cap,member.funds,now);
      if (check === false) over = true; // Known, fresh Nessie availability is also binding. Unknown is caution, not a green.
      routes.push({ ...quote,userId:member.id,name:member.name,check,checkSource:member.funds.source });
    }
    if (!usable || !travelers.length || routes.length !== travelers.length || routes.every(r=>r.local)) continue;
    const total = Math.round(routes.reduce((sum,r)=>sum+r.price!,0)*100)/100;
    if (!over) qualified.push({ ...candidate,routes,complete:true,total });
    else overBudget.push({ ...candidate,fits:false,routes:routes.map(r=>({ ...r,check:null,checkSource:'unknown' as const })),complete:true,total });
  }
  if (!qualified.length && overBudget.length) {
    const closest = overBudget.sort((a,b)=>a.total!-b.total!||a.airport.localeCompare(b.airport)||a.id-b.id).slice(0,3);
    return { options:closest,summary:{ searchedCount:candidates.length,qualifiedCount:0,returnedCount:closest.length } };
  }
  return { options:recommendDestinations(qualified),summary:{ searchedCount:candidates.length,qualifiedCount:qualified.length,returnedCount:Math.min(3,qualified.length) } };
}
/** Comparison snapshots share the existing JSONB column. Legacy final arrays still read unchanged. */
export function readComparison(value: unknown): { options: Option[]; summary: DiscoverySummary | null; discovery: boolean } {
  if (Array.isArray(value)) return { options:value,summary:null,discovery:false };
  const stored = value as any;
  if (stored?.version !== 2 || !Array.isArray(stored.options)) return { options:[],summary:null,discovery:false };
  const s = stored.summary;
  const valid = s && [s.searchedCount,s.qualifiedCount,s.returnedCount].every((n: unknown)=>typeof n==='number'&&Number.isInteger(n)&&n>=0) && s.searchedCount<=6 && s.qualifiedCount<=s.searchedCount && s.returnedCount<=3 && (s.returnedCount<=s.qualifiedCount || s.qualifiedCount===0);
  return { options:stored.options,summary:valid?{searchedCount:s.searchedCount,qualifiedCount:s.qualifiedCount,returnedCount:s.returnedCount}:null,discovery:true };
}

/** Only fixed messages leave the server; provider payloads and private eligibility reasons never do. */
export function discoveryFailure(quotes: Map<string, Quote>): string {
  const remote = [...quotes.values()].filter(q => !q.local);
  if (remote.length && remote.every(q => q.price === null && (q.failure === 'configuration' || q.failure === 'provider'))) {
    return remote.every(q => q.failure === 'configuration')
      ? 'Flight search is not configured. Ask the organizer to contact the app administrator, or try the sample demo.'
      : 'Flight provider unavailable. Try the search again later, or try the sample demo.';
  }
  return 'No destinations fit everyone in this search. Try different shared dates or review your own private flight budget. Missing fares can also limit results.';
}
