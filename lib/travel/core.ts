// Shared, pure travel rules. Safe for the public sample demo: no accounts, DB or providers.
export class TravelInputError extends Error {}
export const AIRPORTS = [
  ['AUS', 'Austin'], ['DEN', 'Denver'], ['ELP', 'El Paso'], ['IAH', 'Houston'],
  ['ORD', 'Chicago'], ['ATL', 'Atlanta'], ['BOS', 'Boston'], ['CLT', 'Charlotte'],
  ['DFW', 'Dallas–Fort Worth'], ['DTW', 'Detroit'], ['EWR', 'Newark'], ['IAD', 'Washington Dulles'],
  ['JFK', 'New York JFK'], ['LAS', 'Las Vegas'], ['LAX', 'Los Angeles'], ['MCO', 'Orlando'],
  ['MIA', 'Miami'], ['MSP', 'Minneapolis'], ['PDX', 'Portland'], ['PHL', 'Philadelphia'],
  ['PHX', 'Phoenix'], ['SAN', 'San Diego'], ['SEA', 'Seattle'], ['SFO', 'San Francisco'], ['SLC', 'Salt Lake City'],
] as const;
export const airportName = (code: string) => AIRPORTS.find(a => a[0] === code)?.[1] ?? code;
export const validAirport = (code: unknown): code is string => typeof code === 'string' && AIRPORTS.some(a => a[0] === code);
export type Candidate = { id: number; airport: string; depart: string; return: string };
export type Vote = 'approve' | 'veto';
export type Ballot = { userId: number; optionId: number; value: Vote };
export type Quote = { origin: string; destination: string; depart: string; return: string; price: number | null; local: boolean; airlines: string[]; stops: number | null; duration: number | null; quotedAt: string; source: 'serpapi' | 'sample' | 'local'; error?: string; failure?: 'configuration' | 'provider' | 'no-fare' };
export type Route = Quote & { userId: number; name: string; check: boolean | null; checkSource: 'nessie-sandbox' | 'simulated' | 'unknown' };
export type Option = Candidate & { routes: Route[]; total: number | null; complete: boolean };
export const CHECK_TTL = 5 * 60_000;
export const FARE_TTL = 15 * 60_000;
export function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function validateCandidates(input: unknown, now = new Date()): Candidate[] {
  if (!Array.isArray(input) || input.length < 2 || input.length > 3) throw new TravelInputError('Choose 2 or 3 destination options.');
  const today = now.toISOString().slice(0, 10);
  const seen = new Set<string>();
  return input.map((x, i) => {
    if (!x || !validAirport(x.airport)) throw new TravelInputError('Choose an airport from the supported US list.');
    if (!validDay(x.depart) || !validDay(x.return) || x.depart <= today || x.return <= x.depart) throw new TravelInputError('Choose a future departure and a later return date.');
    if (new Date(x.return).getTime() - now.getTime() > 365 * 864e5) throw new TravelInputError('Choose dates within the next year.');
    const key = `${x.airport}/${x.depart}/${x.return}`;
    if (seen.has(key)) throw new TravelInputError('Each destination/date option must be different.');
    seen.add(key);
    return { id: i + 1, airport: x.airport, depart: x.depart, return: x.return };
  });
}
export function validateSetup(input: any) {
  if (!input || !validAirport(input.airport)) throw new TravelInputError('Choose your home airport from the supported US list.');
  if (typeof input.budget !== 'number' || !Number.isFinite(input.budget) || input.budget < 0.01 || input.budget > 100000) throw new TravelInputError('Enter a flight budget greater than $0 and at most $100,000.');
  return { airport: input.airport as string, budget: Math.round(input.budget * 100) / 100 };
}
export function optionWithTotals(candidate: Candidate, routes: Route[], memberCount: number): Option {
  const complete = routes.length === memberCount && memberCount > 0 && new Set(routes.map(r => r.userId)).size === memberCount && routes.every(r => typeof r.price === 'number' && Number.isFinite(r.price) && (r.local ? r.price === 0 : r.price > 0));
  return { ...candidate, routes, complete, total: complete ? Math.round(routes.reduce((n, r) => n + r.price!, 0) * 100) / 100 : null };
}
export const cheapest = (options: Option[]) => options.filter(o => o.complete && o.total !== null).sort((a, b) => a.total! - b.total! || a.id - b.id)[0]?.id ?? null;
export function tally(options: Option[], ballots: Ballot[]) {
  return options.filter(o => o.complete && o.total !== null).map(o => ({ id: o.id, total: o.total!, approve: ballots.filter(b => b.optionId === o.id && b.value === 'approve').length, veto: ballots.filter(b => b.optionId === o.id && b.value === 'veto').length })).sort((a, b) => b.approve - a.approve || a.veto - b.veto || a.total - b.total || a.id - b.id);
}
export function winner(options: Option[], ballots: Ballot[]) {
  const ranked = tally(options, ballots);
  if (!ranked.length || ranked.every(r => r.approve === 0 && r.veto > 0)) return null;
  return ranked[0].id;
}
export function ballotComplete(options: Option[], ballots: Ballot[], memberIds: number[]) {
  const eligible = options.filter(o => o.complete);
  return eligible.length > 0 && memberIds.length > 0 && memberIds.every(uid => eligible.every(o => ballots.some(b => b.userId === uid && b.optionId === o.id)));
}
export function toggleBallot(ballots: Ballot[], userId: number, optionId: number, value: Vote): Ballot[] {
  const old = ballots.find(b => b.userId === userId && b.optionId === optionId);
  const rest = ballots.filter(b => b.userId !== userId || b.optionId !== optionId);
  return old?.value === value ? rest : [...rest, { userId, optionId, value }];
}
export function recheckLink(route: Pick<Quote, 'origin' | 'destination' | 'depart' | 'return'>) {
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(`Round trip flights from ${route.origin} to ${route.destination} departing ${route.depart} returning ${route.return}`)}`;
}
// Whitelist at the public boundary; never spread a member, provider or financial object.
export function publicOptions(options: Option[], checkedAt: string, now = Date.now()): Option[] {
  const age = now - Date.parse(checkedAt);
  const fresh = Number.isFinite(age) && age >= 0 && age < CHECK_TTL;
  return options.map(o => ({
    id: o.id, airport: o.airport, depart: o.depart, return: o.return,
    complete: o.complete, total: o.complete ? o.total : null,
    routes: o.routes.map(r => ({
      userId: r.userId, name: r.name, origin: r.origin, destination: r.destination, depart: r.depart, return: r.return,
      price: r.price, local: r.local, airlines: r.airlines, stops: r.stops, duration: r.duration,
      quotedAt: r.quotedAt, source: r.source, error: r.error,
      check: fresh ? r.check : null, checkSource: fresh ? r.checkSource : 'unknown',
    })),
  }));
}
export function defaultCandidates(now = new Date()): Candidate[] {
  const day = (offset: number) => new Date(now.getTime() + offset * 864e5).toISOString().slice(0, 10);
  return ['AUS', 'DEN'].map((airport, i) => ({ id: i + 1, airport, depart: day(30), return: day(33) }));
}
