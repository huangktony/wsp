// Pure discovery rules shared by the server and synthetic demo. No I/O or private data returned.
import { TravelInputError, validAirport, validDay, type Candidate, type Option, type Route, type Quote } from './core';
import { budgetCheck, type Financial } from './finance';
export type DiscoveryDates = { version: 1; mode: 'discover'; depart: string; return: string };
export type DiscoverySummary = { searchedCount: number; qualifiedCount: number; returnedCount: number };
export const SEARCH_LEASE_MS = 150000;
export function defaultDates(now = new Date()): DiscoveryDates {
  const day = (offset: number) => new Date(now.getTime() + offset * 864e5).toISOString().slice(0, 10);
  return { version: 1, mode: 'discover', depart: day(30), return: day(33) };
}
/** Old candidate arrays use the first option's dates. Reading past final trips must not revalidate against today. */
export function readDates(value: unknown): DiscoveryDates | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || typeof raw !== 'object') return null;
  const x = raw as Record<string, unknown>;
  if (!Array.isArray(value) && (x.mode !== undefined && x.mode !== 'discover' || x.version !== undefined && x.version !== 1)) return null;
  if (!validDay(x.depart) || !validDay(x.return) || x.return <= x.depart) return null;
  return { version: 1, mode: 'discover', depart: x.depart, return: x.return };
}
export function validateDates(value: unknown, now = new Date()): DiscoveryDates {
  const dates = readDates(value);
  if (!dates || dates.depart <= now.toISOString().slice(0, 10)) throw new TravelInputError('Choose a future departure and a later return date.');
  if (new Date(dates.return).getTime() - now.getTime() > 365 * 864e5) throw new TravelInputError('Choose dates within the next year.');
  return dates;
}
/** A bounded sample, not a geographic optimum or all-US search: up to two member cities plus varied hubs. */
export function discoveryShortlist(origins: string[], dates: DiscoveryDates): Candidate[] {
  if (!origins.length || origins.length > 8 || origins.some(o => !validAirport(o))) throw new TravelInputError('Every traveler needs a supported home airport.');
  const counts = new Map<string,number>();
  for (const origin of origins) counts.set(origin,(counts.get(origin)??0)+1);
  const memberCities = counts.size > 1 ? [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,2).map(([airport])=>airport) : [];
  const hubs = ['AUS','DEN','ATL','DFW','ORD','LAS','SEA','MCO'];
  return [...new Set([...hubs.slice(0,2),...memberCities,...hubs.slice(2)])].filter(airport=>!origins.every(o=>o===airport)).slice(0,6)
    .map((airport,i)=>({ id:i+1,airport,depart:dates.depart,return:dates.return }));
}
export type DiscoveryTraveler = { id: number; name: string; airport: string; cap: number; funds: Financial };
/** Reject before persistence: group-total cheapness can never conceal a member's over-cap route. */
export function qualifyDestinations(candidates: Candidate[], travelers: DiscoveryTraveler[], quotes: Map<string,Quote>, now = Date.now()): { options: Option[]; summary: DiscoverySummary } {
  const qualified: Option[] = [];
  for (const candidate of candidates) {
    const routes: Route[] = [];
    for (const member of travelers) {
      const quote = quotes.get(`${member.airport}/${candidate.id}`);
      if (!quote || quote.origin !== member.airport || quote.destination !== candidate.airport || quote.depart !== candidate.depart || quote.return !== candidate.return ||
          quote.local !== (quote.origin === quote.destination) || quote.price === null || !Number.isFinite(quote.price) || (quote.local ? quote.price !== 0 || quote.origin !== quote.destination : quote.price <= 0) ||
          !Number.isFinite(member.cap) || member.cap < 0.01 || quote.price > member.cap) break;
      const check = budgetCheck(quote.price,member.cap,member.funds,now);
      if (check === false) break; // Known, fresh Nessie availability is also binding. Unknown is caution, not a green.
      routes.push({ ...quote,userId:member.id,name:member.name,check,checkSource:member.funds.source });
    }
    if (!travelers.length || routes.length !== travelers.length || routes.every(r=>r.local)) continue;
    qualified.push({ ...candidate,routes,complete:true,total:Math.round(routes.reduce((sum,r)=>sum+r.price!,0)*100)/100 });
  }
  qualified.sort((a,b)=>a.total!-b.total!||a.airport.localeCompare(b.airport)||a.id-b.id);
  return { options:qualified.slice(0,3),summary:{ searchedCount:candidates.length,qualifiedCount:qualified.length,returnedCount:Math.min(3,qualified.length) } };
}
/** Comparison snapshots share the existing JSONB column. Legacy final arrays still read unchanged. */
export function readComparison(value: unknown): { options: Option[]; summary: DiscoverySummary | null; discovery: boolean } {
  if (Array.isArray(value)) return { options:value,summary:null,discovery:false };
  const stored = value as any;
  if (stored?.version !== 2 || !Array.isArray(stored.options)) return { options:[],summary:null,discovery:false };
  const s = stored.summary;
  const valid = s && [s.searchedCount,s.qualifiedCount,s.returnedCount].every((n: unknown)=>typeof n==='number'&&Number.isInteger(n)&&n>=0) && s.searchedCount<=6 && s.qualifiedCount<=s.searchedCount && s.returnedCount<=3 && s.returnedCount<=s.qualifiedCount;
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
