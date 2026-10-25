// Shared, pure travel rules. Safe for the public sample demo: no accounts, DB or providers.
export class TravelInputError extends Error {}
// [code, city, region, country]. Region is the US state, or the country code for international airports.
// Home airports are US only; international ones are destinations. Coordinates live in discovery.ts `geography`.
export const AIRPORTS: readonly (readonly [code: string, city: string, region: string, country: string])[] = [
  ['AUS', 'Austin', 'TX', 'US'], ['DEN', 'Denver', 'CO', 'US'], ['ELP', 'El Paso', 'TX', 'US'], ['IAH', 'Houston', 'TX', 'US'],
  ['ORD', 'Chicago', 'IL', 'US'], ['ATL', 'Atlanta', 'GA', 'US'], ['BOS', 'Boston', 'MA', 'US'], ['CLT', 'Charlotte', 'NC', 'US'],
  ['DFW', 'Dallas–Fort Worth', 'TX', 'US'], ['DTW', 'Detroit', 'MI', 'US'], ['EWR', 'Newark', 'NJ', 'US'], ['IAD', 'Washington Dulles', 'VA', 'US'],
  ['JFK', 'New York JFK', 'NY', 'US'], ['LAS', 'Las Vegas', 'NV', 'US'], ['LAX', 'Los Angeles', 'CA', 'US'], ['MCO', 'Orlando', 'FL', 'US'],
  ['MIA', 'Miami', 'FL', 'US'], ['MSP', 'Minneapolis', 'MN', 'US'], ['PDX', 'Portland', 'OR', 'US'], ['PHL', 'Philadelphia', 'PA', 'US'],
  ['PHX', 'Phoenix', 'AZ', 'US'], ['SAN', 'San Diego', 'CA', 'US'], ['SEA', 'Seattle', 'WA', 'US'], ['SFO', 'San Francisco', 'CA', 'US'], ['SLC', 'Salt Lake City', 'UT', 'US'],
  ['SAT', 'San Antonio', 'TX', 'US'], ['HOU', 'Houston Hobby', 'TX', 'US'], ['DAL', 'Dallas Love Field', 'TX', 'US'],
  ['OAK', 'Oakland', 'CA', 'US'], ['SJC', 'San Jose', 'CA', 'US'], ['SMF', 'Sacramento', 'CA', 'US'], ['BUR', 'Burbank', 'CA', 'US'],
  ['FLL', 'Fort Lauderdale', 'FL', 'US'], ['TPA', 'Tampa', 'FL', 'US'], ['LGA', 'New York LaGuardia', 'NY', 'US'],
  ['CUN', 'Cancún', 'MX', 'MX'], ['MEX', 'Mexico City', 'MX', 'MX'], ['PVR', 'Puerto Vallarta', 'MX', 'MX'],
  ['YYZ', 'Toronto', 'CA', 'CA'], ['YVR', 'Vancouver', 'CA', 'CA'], ['LHR', 'London', 'GB', 'GB'], ['CDG', 'Paris', 'FR', 'FR'],
  ['FCO', 'Rome', 'IT', 'IT'], ['BCN', 'Barcelona', 'ES', 'ES'], ['HND', 'Tokyo', 'JP', 'JP'], ['ICN', 'Seoul', 'KR', 'KR'], ['SJO', 'San José, Costa Rica', 'CR', 'CR'],
];
export const airportName = (code: string) => AIRPORTS.find(a => a[0] === code)?.[1] ?? code;
/** Any supported airport, US or international (destinations and flight lookups). */
export const validAirport = (code: unknown): code is string => typeof code === 'string' && AIRPORTS.some(a => a[0] === code);
export const US_AIRPORTS = AIRPORTS.filter(a => a[3] === 'US');
export const INTERNATIONAL_AIRPORTS = AIRPORTS.filter(a => a[3] !== 'US');
/** Home airports are US only. */
export const validHomeAirport = (code: unknown): code is string => typeof code === 'string' && US_AIRPORTS.some(a => a[0] === code);
export const airportRegion = (code: string) => AIRPORTS.find(a => a[0] === code)?.[2];
export type TripScope = 'state' | 'national' | 'global';
export const SCOPES: readonly { value: TripScope; label: string }[] = [{ value: 'state', label: 'In-state' }, { value: 'national', label: 'National' }, { value: 'global', label: 'Global' }];
export const scopeLabel = (scope: TripScope) => SCOPES.find(s => s.value === scope)?.label ?? 'National';
export type Candidate = { id: number; airport: string; depart: string; return: string };
export type Vote = 'approve' | 'veto';
export type Ballot = { userId: number; optionId: number; value: Vote };
export type Quote = { origin: string; destination: string; depart: string; return: string; price: number | null; local: boolean; airlines: string[]; stops: number | null; duration: number | null; quotedAt: string; source: 'serpapi' | 'sample' | 'local'; error?: string; failure?: 'configuration' | 'provider' | 'no-fare' };
export type Route = Quote & { userId: number; name: string; check: boolean | null; checkSource: 'nessie-sandbox' | 'simulated' | 'unknown' };
export type Recommendation = { kind: 'lowest-cost' | 'easiest-travel' | 'balanced' | 'alternative'; label: string; reason: string };
/** `fits: false` marks a closest-but-over-budget option, offered only when nothing fits. Its routes carry no per-person check. */
export type Option = Candidate & { routes: Route[]; total: number | null; complete: boolean; recommendation?: Recommendation; fits?: false };
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
  if (!input || !validHomeAirport(input.airport)) throw new TravelInputError('Choose your home airport from the supported US list.');
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
    ...(o.fits === false ? { fits: false as const } : {}),
    ...(o.recommendation ? { recommendation: { kind:o.recommendation.kind, label:o.recommendation.label, reason:o.recommendation.reason } } : {}),
    routes: o.routes.map(r => ({
      userId: r.userId, name: r.name, origin: r.origin, destination: r.destination, depart: r.depart, return: r.return,
      price: r.price, local: r.local, airlines: r.airlines, stops: r.stops, duration: r.duration,
      quotedAt: r.quotedAt, source: r.source, error: r.error,
      check: fresh && o.fits !== false ? r.check : null, checkSource: fresh && o.fits !== false ? r.checkSource : 'unknown',
    })),
  }));
}
export function defaultCandidates(now = new Date()): Candidate[] {
  const day = (offset: number) => new Date(now.getTime() + offset * 864e5).toISOString().slice(0, 10);
  return ['AUS', 'DEN'].map((airport, i) => ({ id: i + 1, airport, depart: day(30), return: day(33) }));
}

export type BudgetSuggestions = { light: number; room: number; flex: number; available: number };
const PRESET_LABELS = ['Keep it light', 'A little room', 'More flexibility'];
/** Fixed amounts are used when there is no live bank account to size the presets from. */
const FALLBACK_PRESETS = [200, 400, 700];
export const presetsFor = (s: BudgetSuggestions | null | undefined) => (s ? [s.light, s.room, s.flex] : FALLBACK_PRESETS).map((amount, i) => ({ amount, label: PRESET_LABELS[i] }));
