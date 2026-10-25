// Server only. Google Flights prices are the whole round trip; never double them.
import { type Candidate, type Quote, FARE_TTL, validAirport } from './core';
export function normalizeFlight(data: any): { price: number; airlines: string[]; stops: number | null; duration: number | null } | null {
  if (!data || data.error || data.search_metadata?.status === 'Error') return null;
  const rows = [...(Array.isArray(data.best_flights) ? data.best_flights : []), ...(Array.isArray(data.other_flights) ? data.other_flights : [])];
  const best = rows.filter(r => (r?.type == null || r.type === 1 || (typeof r.type === 'string' && /^round[ -]?trip$/i.test(r.type))) && typeof r?.price === 'number' && Number.isFinite(r.price) && r.price > 0).sort((a, b) => a.price - b.price)[0];
  if (!best) return null;
  const flights = Array.isArray(best.flights) ? best.flights : [];
  return { price: best.price, airlines: [...new Set<string>(flights.map((f: any) => f.airline).filter((a: any) => typeof a === 'string').map((a: string) => a.slice(0, 80)))], stops: flights.length ? flights.length - 1 : null, duration: Number.isFinite(best.total_duration) && best.total_duration > 0 ? best.total_duration : null };
}
export function flightParams(origin: string, option: Candidate) {
  if (!validAirport(origin) || !validAirport(option.airport)) throw Error('Unsupported airport.');
  return { engine: 'google_flights', type: '1', departure_id: origin, arrival_id: option.airport, outbound_date: option.depart, return_date: option.return, currency: 'USD', adults: '1', travel_class: '1' };
}
async function requestFlight(origin: string, option: Candidate, request: typeof fetch = fetch, key = process.env.SERPAPI_KEY): Promise<Quote> {
  const base: Quote = { origin, destination: option.airport, depart: option.depart, return: option.return, price: null, local: false, airlines: [], stops: null, duration: null, quotedAt: new Date().toISOString(), source: 'serpapi' };
  if (!validAirport(origin) || !validAirport(option.airport)) return { ...base, error: 'Unsupported airport.' };
  if (origin === option.airport) return { ...base, price: 0, local: true, source: 'local', stops: 0, duration: 0 };
  if (!key) return { ...base, failure: 'configuration', error: 'Flight search is not configured. Ask the organizer to contact the app administrator, or try the sample demo.' };
  try {
    const query = new URLSearchParams({ ...flightParams(origin, option), api_key: key, no_cache: 'true' });
    const response = await request(`https://serpapi.com/search.json?${query}`, { signal: AbortSignal.timeout(10000), cache: 'no-store' });
    if (!response.ok) return { ...base, failure: 'provider', error: 'Flight provider unavailable. Refresh comparison to retry.' };
    const data = await response.json();
    const result = normalizeFlight(data);
    const quotedAt = providerQuoteTime(data, Date.parse(base.quotedAt));
    if (result && Date.now()-Date.parse(quotedAt)>=FARE_TTL) return { ...base, quotedAt, failure:'no-fare', error:'The provider returned an expired fare. Refresh comparison to retry.' };
    return result ? { ...base, ...result, quotedAt } : { ...base, failure: data?.error || data?.search_metadata?.status === 'Error' ? 'provider' : 'no-fare', error: data?.error || data?.search_metadata?.status === 'Error' ? 'Flight provider unavailable. Refresh comparison to retry.' : 'No round-trip fare found for these dates.' };
  } catch { return { ...base, failure: 'provider', error: 'Flight search timed out or is unavailable. Refresh comparison to retry.' }; }
}
/** Provider timestamps survive cache hits; receiving a cached fare does not make it newly quoted.
 * SerpApi created_at format is documented at https://serpapi.com/google-flights-api.
 * Local cache bounds the calls; no_cache asks upstream for a fresh quote once ours expires.
 */
export function providerQuoteTime(data: any, requestedAt: number): string {
  const parsed = [data?.search_metadata?.created_at,data?.search_metadata?.processed_at]
    .filter((v): v is string => typeof v==='string')
    .map(v=>Date.parse(v.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) UTC$/, '$1T$2Z')))
    .filter(Number.isFinite);
  return new Date(Math.min(requestedAt,...parsed)).toISOString();
}
const MAX_CACHED_ROUTES = 128;
const MAX_PENDING_ROUTES = 64;
type FareCache = { quotes: Map<string,Quote>; pending: Map<string,Promise<Quote>> };
// Separate injected transports (tests) and production. No caps, accounts, checks, or member IDs enter this cache.
const caches = new WeakMap<typeof fetch,FareCache>();
const copyQuote = (quote: Quote): Quote => ({...quote,airlines:[...quote.airlines]});
export async function fetchFlight(origin: string, option: Candidate, request: typeof fetch = fetch, key = process.env.SERPAPI_KEY): Promise<Quote> {
  if (!key || !validAirport(origin) || !validAirport(option.airport) || origin===option.airport) return requestFlight(origin,option,request,key);
  let cache = caches.get(request);
  if (!cache) { cache={quotes:new Map(),pending:new Map()}; caches.set(request,cache); }
  const routeKey = `${origin}/${option.airport}/${option.depart}/${option.return}/USD/1/economy`;
  for (const [id,quote] of cache.quotes) {
    const age = Date.now()-Date.parse(quote.quotedAt);
    if (!Number.isFinite(age) || age<0 || age>=FARE_TTL) cache.quotes.delete(id);
  }
  const hit = cache.quotes.get(routeKey);
  if (hit) { cache.quotes.delete(routeKey); cache.quotes.set(routeKey,hit); return copyQuote(hit); }
  const pending = cache.pending.get(routeKey);
  if (pending) return copyQuote(await pending);
  const work = requestFlight(origin,option,request,key);
  const tracked = cache.pending.size < MAX_PENDING_ROUTES;
  if (tracked) cache.pending.set(routeKey,work);
  try {
    const quote = await work;
    if (quote.price!==null && Date.now()-Date.parse(quote.quotedAt)<FARE_TTL) {
      cache.quotes.set(routeKey,copyQuote(quote));
      while (cache.quotes.size>MAX_CACHED_ROUTES) cache.quotes.delete(cache.quotes.keys().next().value!);
    }
    return copyQuote(quote);
  } finally { if (tracked) cache.pending.delete(routeKey); }
}
/** One comparison does at most 8 x 6 unique routes, four at a time. Results persist; polling never fetches. */
export async function compareFlights(origins: string[], candidates: Candidate[], find = fetchFlight) {
  if (origins.length > 8 || candidates.length > 6) throw Error('Too many routes.');
  const tasks = [...new Map(origins.flatMap(origin => candidates.map(option => [`${origin}/${option.id}`, { origin, option }] as const))).entries()];
  const quotes = new Map<string, Quote>();
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const [key, task] = tasks[cursor++];
      quotes.set(key, await find(task.origin, task.option));
    }
  }));
  return quotes;
}
