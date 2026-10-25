// Server-only persistence and orchestration. Every trip mutation holds one advisory lock.
import { readDates, discoveryFailure, validateDates, discoveryShortlist, qualifyDestinations, readComparison, SEARCH_LEASE_MS, type DiscoverySummary } from './discovery';
import { travelPhase } from './flow';
import { pool, q, q1 } from '../db';
import type { PoolClient } from 'pg';
import { randomBytes } from 'node:crypto';
import { loadSpending, isLiveAccount } from '../nessie';
import { availableFunds, type Financial } from './finance';
import { compareFlights } from './flights';
import { validateSetup, publicOptions, ballotComplete, winner, tally, type Option, type Ballot } from './core';
export class TravelError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
export type Member = { user_id: number; name: string; airport: string | null; flight_budget: number | null; nessie_account_id: string | null };
type Trip = { id: number; name: string; organizer_id: number; invite_code: string; candidates: unknown; revision: number };
type Comparison = { id: number; revision: number; status: string; options: Option[]; summary: DiscoverySummary | null; discovery: boolean; member_ids: number[]; winner_id: number | null; error: string | null; checked_at: Date | null; expires_at: Date | null; created_at: Date };
export function positiveId(value: unknown) { const id = Number(value); if (!Number.isSafeInteger(id) || id < 1) throw new TravelError('Invalid trip or comparison.'); return id; }
const one = async <T = any>(c: PoolClient, sql: string, args: unknown[] = []): Promise<T | undefined> => (await c.query(sql, args)).rows[0];
async function locked<T>(tripId: number, uid: number, fn: (c: PoolClient, trip: Trip) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query('select pg_advisory_xact_lock(7171,$1)', [tripId]);
    const trip = await one<Trip>(c, 'select t.* from travel_trips t join travel_members m on m.trip_id=t.id where t.id=$1 and m.user_id=$2', [tripId, uid]);
    if (!trip) throw new TravelError('Trip not found or you are not a member.', 403);
    const result = await fn(c, trip);
    await c.query('commit'); return result;
  } catch (e) { await c.query('rollback').catch(() => {}); throw e; }
  finally { c.release(); }
}
const organizer = (trip: Trip, uid: number) => { if (trip.organizer_id !== uid) throw new TravelError('Only the organizer can do that.', 403); };
async function invalidate(c: PoolClient, id: number) {
  await c.query('update travel_trips set revision=revision+1 where id=$1', [id]);
  await c.query("update travel_comparisons set status='stale' where trip_id=$1 and status in ('generating','voting','final','vetoed')", [id]);
}
async function members(c: PoolClient, id: number): Promise<Member[]> {
  return (await c.query('select m.user_id,u.name,m.airport,m.flight_budget::float,u.nessie_account_id from travel_members m join users u on u.id=m.user_id where m.trip_id=$1 order by m.user_id', [id])).rows;
}
const ballots = async (c: PoolClient, id: number): Promise<Ballot[]> => (await c.query('select user_id as "userId",option_id as "optionId",value from travel_votes where comparison_id=$1', [id])).rows;
async function latest(c: PoolClient, id: number): Promise<Comparison | undefined> {
  const row = await one(c, 'select * from travel_comparisons where trip_id=$1 order by id desc limit 1', [id]);
  return row ? { ...row,...readComparison(row.options) } : undefined;
}
function usable(row: Comparison | undefined, trip: Trip) {
  if (!row || row.revision !== trip.revision || row.status !== 'voting' || !row.discovery || !row.expires_at || new Date(row.expires_at).getTime() <= Date.now()) throw new TravelError('This comparison is closed or out of date. Ask the organizer to refresh fares.', 409);
}
export async function listTrips(uid: number) {
  const rows = await q<any>(`select t.id,t.name,
    (select count(*)::int from travel_members where trip_id=t.id) members,
    (select count(*)::int from travel_members where trip_id=t.id and airport is not null and flight_budget>0) ready,
    (m.airport is not null and m.flight_budget>0) setup_done,
    c.id comparison_id,c.status,c.revision comparison_revision,t.revision,c.discovery,
    (c.expires_at<=now()) expired,
    exists(select 1 from travel_votes where comparison_id=c.id and user_id=$1) my_voted
    from travel_trips t join travel_members m on m.trip_id=t.id
    left join lateral (select id,status,revision,expires_at,(options->>'version'='2') discovery from travel_comparisons where trip_id=t.id order by id desc limit 1) c on true
    where m.user_id=$1 order by t.id desc`, [uid]);
  return rows.map(r => {
    const status = r.comparison_id ? r.comparison_revision === r.revision && (r.status === 'final' || r.discovery === true) ? r.status : 'stale' : null;
    const phase = travelPhase(status ? { status, expired: r.expired } : null, r.ready, r.members);
    return { id: r.id, name: r.name, members: r.members, ready: r.ready, setupDone: r.setup_done === true,
      phase, myVoted: phase === 'voting' && r.my_voted === true };
  });
}
export async function createTrip(uid: number, body: any) {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 60) throw new TravelError('Give your trip a name (1–60 characters).');
  const candidates = validateDates(body?.dates ?? body?.candidates);
  const c = await pool.connect();
  try {
    await c.query('begin');
    let trip;
    for (let attempt = 0; attempt < 5 && !trip; attempt++) {
      trip = await one(c, 'insert into travel_trips(name,organizer_id,invite_code,candidates) values($1,$2,$3,$4::jsonb) on conflict(invite_code) do nothing returning id', [name, uid, `TRIP-${randomBytes(6).toString('hex').toUpperCase()}`, JSON.stringify(candidates)]);
    }
    if (!trip) throw new TravelError('Could not create an invitation. Try again.', 503);
    await c.query('insert into travel_members(trip_id,user_id) values($1,$2)', [trip.id, uid]);
    await c.query('commit'); return { id: trip.id };
  } catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { c.release(); }
}
export async function joinTrip(uid: number, body: any) {
  const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : '';
  if (!/^TRIP-[A-F0-9]{12}$/.test(code)) throw new TravelError('Enter a valid Travel invite code.');
  const c = await pool.connect();
  try {
    await c.query('begin');
    const trip = await one<Trip>(c, 'select * from travel_trips where invite_code=$1', [code]);
    if (!trip) throw new TravelError('Invite not found.', 404);
    await c.query('select pg_advisory_xact_lock(7171,$1)', [trip.id]);
    const list = await members(c, trip.id);
    if (!list.some(m => m.user_id === uid)) {
      if (list.length >= 8) throw new TravelError('This trip has reached its 8-person limit.', 409);
      await c.query('insert into travel_members(trip_id,user_id) values($1,$2)', [trip.id, uid]);
      await invalidate(c, trip.id);
    }
    await c.query('commit'); return { id: trip.id, setupDone: list.some(m => m.user_id === uid && !!m.airport && !!m.flight_budget) };
  } catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { c.release(); }
}
export async function ownSetup(id: number, uid: number) {
  return locked(id, uid, async c => {
    const me = await one(c, 'select airport,flight_budget::float budget from travel_members where trip_id=$1 and user_id=$2', [id, uid]);
    return { airport: me.airport, budget: me.budget };
  });
}
export async function saveSetup(id: number, uid: number, body: any) {
  // No user id accepted: caller can only edit their authenticated membership.
  if (body?.userId !== undefined || body?.user_id !== undefined) throw new TravelError('You can only edit your own setup.', 403);
  const setup = validateSetup(body);
  return locked(id, uid, async c => {
    const changed = await one(c, 'update travel_members set airport=$3,flight_budget=$4 where trip_id=$1 and user_id=$2 and (airport is distinct from $3 or flight_budget is distinct from $4) returning user_id', [id, uid, setup.airport, setup.budget]);
    if (changed) await invalidate(c, id);
    return { ok: true };
  });
}
export async function saveDates(id: number, uid: number, body: any) {
  const options = validateDates(body?.dates ?? body?.candidates);
  return locked(id, uid, async (c, trip) => {
    organizer(trip, uid);
    if (JSON.stringify(options) !== JSON.stringify(trip.candidates)) {
      await c.query('update travel_trips set candidates=$2::jsonb where id=$1', [id, JSON.stringify(options)]);
      await invalidate(c, id);
    }
    return { ok: true };
  });
}
export async function readTrip(id: number, uid: number) {
  return locked(id, uid, async (c, trip) => {
    const list = await members(c, id);
    const row = await latest(c, id);
    const current = row && row.revision === trip.revision && row.status !== 'stale' && (row.discovery || row.status === 'final');
    const options = current ? publicOptions(row.options, row.checked_at ? new Date(row.checked_at).toISOString() : '') : [];
    const votes = current ? await ballots(c, row.id) : [];
    const expired = !!row?.expires_at && new Date(row.expires_at).getTime() <= Date.now();
    return {
      id: trip.id, name: trip.name, inviteCode: trip.invite_code, organizer: trip.organizer_id === uid, me: uid,
      dates: readDates(trip.candidates),
      members: list.map(m => ({ id: m.user_id, name: m.name, airport: m.airport, ready: !!m.airport && !!m.flight_budget })),
      comparison: row ? { id: row.id, status: current ? row.status : 'stale', options, summary: current ? row.summary : null, error: row.error,
        createdAt: row.created_at, stalled: current && row.status === 'generating' && Date.now() - new Date(row.created_at).getTime() >= SEARCH_LEASE_MS,
        checkedAt: row.checked_at, expiresAt: row.expires_at, expired, winnerId: current ? row.winner_id : null,
        myVotes: votes.filter(b => b.userId === uid).map(b => ({ optionId: b.optionId, value: b.value })),
        voted: new Set(votes.map(b => b.userId)).size,
        tally: current && ['final','vetoed'].includes(row.status) ? tally(options, votes) : undefined } : null,
    };
  });
}
async function financial(m: Member): Promise<Financial> {
  const checkedAt = Date.now();
  if (!m.nessie_account_id) return { available: null, checkedAt, source: 'unknown' };
  if (!isLiveAccount(m.nessie_account_id)) return { available: null, checkedAt, source: 'simulated' };
  try {
    const [data, due] = await Promise.all([loadSpending(m.nessie_account_id), q1<{ owed: number }>("select coalesce(sum(amount),0)::float owed from payments where user_id=$1 and status='owed'", [m.user_id])]);
    return { available: availableFunds(data.balance, data.purchases, data.ledger, due?.owed ?? 0), checkedAt, source: 'nessie-sandbox' };
  } catch { return { available: null, checkedAt, source: 'unknown' }; }
}
export async function startComparison(id: number, uid: number) {
  const claim = await locked(id, uid, async (c, trip) => {
    organizer(trip, uid);
    const list = await members(c, id);
    if (!list.length || list.length > 8 || list.some(m => !m.airport || !m.flight_budget)) throw new TravelError('Everyone must finish their airport and private flight budget setup first.', 409);
    const dates = validateDates(trip.candidates);
    const candidates = discoveryShortlist(list.map(m=>m.airport!),dates);
    const last = await latest(c, id);
    if (last?.status === 'generating' && last.discovery && last.revision === trip.revision && Date.now() - new Date(last.created_at).getTime() < SEARCH_LEASE_MS) return { existing: last.id };
    await c.query("update travel_comparisons set status='stale' where trip_id=$1 and status in ('generating','voting','final','vetoed')", [id]);
    const row = await one(c, "insert into travel_comparisons(trip_id,revision,status,member_ids,options) values($1,$2,'generating',$3,$4::jsonb) returning id", [id, trip.revision, list.map(m => m.user_id), JSON.stringify({version:2,options:[],summary:null})]);
    return { comparisonId: row.id as number, revision: trip.revision, list, candidates };
  });
  if ('existing' in claim) return { comparisonId: claim.existing };
  try {
    const [quotes, funds] = await Promise.all([
      compareFlights(claim.list.map(m => m.airport!), claim.candidates),
      Promise.all(claim.list.map(financial)),
    ]);
    const { options,summary } = qualifyDestinations(claim.candidates,claim.list.map((m,i)=>({
      id:m.user_id,name:m.name,airport:m.airport!,cap:m.flight_budget!,funds:funds[i],
    })),quotes);
    return await locked(id, uid, async (c, trip) => {
      const last = await latest(c, id);
      if (trip.revision !== claim.revision || last?.id !== claim.comparisonId || last.status !== 'generating') throw new TravelError('Trip settings changed during search. Start a new comparison.', 409);
      const complete = options.some(o => o.complete);
      await c.query("update travel_comparisons set status=$2,options=$3::jsonb,checked_at=$5,expires_at=now()+interval '15 minutes',error=$4 where id=$1", [claim.comparisonId, complete ? 'voting' : 'failed', JSON.stringify({version:2,options,summary}), complete ? null : discoveryFailure(quotes), new Date(Math.min(...funds.map(f => f.checkedAt))).toISOString()]);
      return { comparisonId: claim.comparisonId };
    });
  } catch (e) {
    await q("update travel_comparisons set status='failed',error='Comparison could not finish. Please try again.' where id=$1 and status='generating'", [claim.comparisonId]);
    throw e;
  }
}
async function finish(c: PoolClient, row: Comparison, votes: Ballot[]) {
  const id = winner(row.options, votes);
  await c.query('update travel_comparisons set status=$2,winner_id=$3 where id=$1', [row.id, id === null ? 'vetoed' : 'final', id]);
}
export async function castVote(id: number, uid: number, body: any) {
  const comparisonId = positiveId(body?.comparisonId), optionId = positiveId(body?.optionId);
  if (!['approve','veto',null].includes(body?.value)) throw new TravelError('Vote must be approve, veto or null.');
  return locked(id, uid, async (c, trip) => {
    const row = await latest(c, id); usable(row, trip);
    if (row!.id !== comparisonId || !row!.member_ids.includes(uid) || !row!.options.some(o => o.id === optionId && o.complete)) throw new TravelError('This option is not available for voting.', 409);
    if (body.value === null) await c.query('delete from travel_votes where comparison_id=$1 and user_id=$2 and option_id=$3', [comparisonId, uid, optionId]);
    else await c.query('insert into travel_votes(comparison_id,user_id,option_id,value) values($1,$2,$3,$4) on conflict(comparison_id,user_id,option_id) do update set value=excluded.value', [comparisonId, uid, optionId, body.value]);
    const votes = await ballots(c, comparisonId);
    if (ballotComplete(row!.options, votes, row!.member_ids)) await finish(c, row!, votes);
    return { ok: true };
  });
}
export async function closeComparison(id: number, uid: number, body: any) {
  return locked(id, uid, async (c, trip) => {
    organizer(trip, uid);
    const row = await latest(c, id); usable(row, trip);
    if (row!.id !== positiveId(body?.comparisonId)) throw new TravelError('This comparison is out of date.', 409);
    const votes = await ballots(c, row!.id);
    if (!votes.length) throw new TravelError('At least one vote is needed before closing.', 409);
    await finish(c, row!, votes); return { ok: true };
  });
}
