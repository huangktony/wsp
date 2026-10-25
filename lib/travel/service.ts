// Server-only persistence and orchestration. Every trip mutation holds one advisory lock.
import { readDates, discoveryFailure, validateDates, discoveryShortlist, qualifyDestinations, readComparison, SEARCH_LEASE_MS, type DiscoverySummary } from './discovery';
import { travelPhase } from './flow';
import { pool, q, q1 } from '../db';
import type { PoolClient } from 'pg';
import { randomBytes } from 'node:crypto';
import { loadSpending, isLiveAccount } from '../nessie';
import { availableFunds, type Financial } from './finance';
import { compareFlights } from './flights';
import { validAirport, validateSetup, publicOptions, tally, type Option, type Ballot } from './core';
import { ballotState, ballotProgress, majority, shouldClose, type BallotState } from './ballot';
export class TravelError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
export type Member = { user_id: number; name: string; airport: string | null; flight_budget: number | null; nessie_account_id: string | null };
type Trip = { id: number; name: string; organizer_id: number; invite_code: string; candidates: unknown; revision: number };
type Comparison = { id: number; revision: number; status: string; options: Option[]; summary: DiscoverySummary | null; discovery: boolean; member_ids: number[]; winner_id: number | null; error: string | null; checked_at: Date | null; expires_at: Date | null; created_at: Date; ballot: BallotState; envelope: Record<string, any> };
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
  await c.query("update travel_comparisons set status='stale' where trip_id=$1 and status in ('generating','voting','vetoed')", [id]);
}
async function members(c: PoolClient, id: number): Promise<Member[]> {
  return (await c.query('select m.user_id,u.name,m.airport,m.flight_budget::float,u.nessie_account_id from travel_members m join users u on u.id=m.user_id where m.trip_id=$1 order by m.user_id', [id])).rows;
}
const ballots = async (c: PoolClient, id: number): Promise<Ballot[]> => (await c.query('select user_id as "userId",option_id as "optionId",value from travel_votes where comparison_id=$1', [id])).rows;
function decode(row: any): Comparison | undefined {
  if (!row) return undefined;
  return { ...row, ...readComparison(row.options), ballot: ballotState(row.options, row.created_at),
    envelope: !Array.isArray(row.options) && row.options && typeof row.options === 'object' ? row.options : { version: 2, options: row.options, summary: null } };
}
async function latest(c: PoolClient, id: number): Promise<Comparison | undefined> {
  return decode(await one(c, 'select * from travel_comparisons where trip_id=$1 order by id desc limit 1', [id]));
}
async function savedFinal(c: PoolClient, id: number): Promise<Comparison | undefined> {
  return decode(await one(c, "select * from travel_comparisons where trip_id=$1 and status='final' order by id desc limit 1", [id]));
}
async function saveBallot(c: PoolClient, row: Comparison) {
  row.envelope = { ...row.envelope, ballot: row.ballot };
  await c.query('update travel_comparisons set options=$2::jsonb where id=$1', [row.id, JSON.stringify(row.envelope)]);
}
function eligibleIds(row: Comparison, list: Member[]) {
  return row.member_ids.filter(id => list.some(m => m.user_id === id));
}
async function settle(c: PoolClient, row: Comparison | undefined, trip: Trip, list: Member[], force = false) {
  if (!row || row.status !== 'voting' || row.revision !== trip.revision || !row.discovery) return;
  const votes = await ballots(c, row.id);
  const ids = eligibleIds(row, list);
  const progress = ballotProgress(row.options, votes, ids, row.ballot);
  if (!shouldClose({ force, expired: Date.parse(row.ballot.deadline) <= Date.now(), members: ids.length, confirmed: progress.confirmed, remaining: progress.remaining })) return;
  row.status = progress.winner === null ? 'vetoed' : 'final';
  row.winner_id = progress.winner;
  await c.query('update travel_comparisons set status=$2,winner_id=$3 where id=$1', [row.id, row.status, row.winner_id]);
}
function usable(row: Comparison | undefined, trip: Trip): asserts row is Comparison {
  if (!row || row.revision !== trip.revision || row.status !== 'voting' || !row.discovery) throw new TravelError('This destination vote is closed or the trip settings changed.', 409);
}
export async function listTrips(uid: number) {
  const trips = await q<{ id: number }>('select t.id from travel_trips t join travel_members m on m.trip_id=t.id where m.user_id=$1 order by t.id desc', [uid]);
  return Promise.all(trips.map(async ({ id }) => {
    const trip = await readTrip(id, uid);
    const ready = trip.members.filter(m => m.ready).length;
    const row = trip.comparison;
    // Fare freshness never determines whether a destination ballot is open.
    const phase = travelPhase(row ? { status: row.status, expired: false } : null, ready, trip.members.length);
    return { id, name: trip.name, members: trip.members.length, ready,
      setupDone: trip.members.some(m => m.id === uid && m.ready), phase,
      myVoted: phase === 'voting' && !!row?.myVotes.length, myConfirmed: row?.myConfirmed ?? false,
      hasSavedFinal: !!trip.savedFinal,
    };
  }));
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
    if ((await savedFinal(c, id))?.ballot.finalConfirmedAt) throw new TravelError('The meeting place is confirmed. Shared dates are locked.', 409);
    if (JSON.stringify(options) !== JSON.stringify(trip.candidates)) {
      await c.query('update travel_trips set candidates=$2::jsonb where id=$1', [id, JSON.stringify(options)]);
      await invalidate(c, id);
    }
    return { ok: true };
  });
}
async function publicComparison(c: PoolClient, row: Comparison, trip: Trip, list: Member[], uid: number) {
  const current = row.status === 'final' || (row.revision === trip.revision && row.status !== 'stale' && row.discovery);
  const options = current ? publicOptions(row.options, row.checked_at ? new Date(row.checked_at).toISOString() : '') : [];
  const ids = eligibleIds(row, list);
  const votes = current ? (await ballots(c, row.id)).filter(v => ids.includes(v.userId)) : [];
  const progress = ballotProgress(row.options, votes, ids, row.ballot, uid);
  const requests = row.ballot.redraw.filter(id => list.some(m => m.user_id === id));
  return { id: row.id, status: current ? row.status : 'stale', options, summary: current ? row.summary : null, error: row.error,
    createdAt: row.created_at, stalled: current && row.status === 'generating' && Date.now() - new Date(row.created_at).getTime() >= SEARCH_LEASE_MS,
    checkedAt: row.checked_at, expiresAt: row.expires_at, expired: !!row.expires_at && new Date(row.expires_at).getTime() <= Date.now(),
    deadline: row.ballot.deadline, confirmedAt: row.ballot.finalConfirmedAt, winnerId: current ? row.winner_id : null,
    settingsChanged: row.revision !== trip.revision,
    myVotes: votes.filter(v => v.userId === uid).map(v => ({ optionId: v.optionId, value: v.value })),
    voted: new Set(votes.map(v => v.userId)).size, memberCount: ids.length,
    confirmed: progress.confirmed, myConfirmed: progress.myConfirmed,
    canConfirm: current && row.status === 'voting' && progress.canConfirm,
    removedOptionIds: current ? progress.removedOptionIds : [],
    redraw: row.status === 'final' ? { votes: requests.length, members: list.length, needed: majority(list.length), mine: requests.includes(uid), locked: !!row.ballot.finalConfirmedAt } : null,
    tally: current && ['final','vetoed'].includes(row.status) ? tally(options, votes) : undefined,
  };
}
export async function readTrip(id: number, uid: number) {
  return locked(id, uid, async (c, trip) => {
    const list = await members(c, id);
    const row = await latest(c, id);
    await settle(c, row, trip, list);
    const final = row?.status === 'final' ? row : await savedFinal(c, id);
    return { id: trip.id, name: trip.name, inviteCode: trip.invite_code, organizer: trip.organizer_id === uid, me: uid,
      dates: readDates(trip.candidates),
      members: list.map(m => ({ id: m.user_id, name: m.name, airport: m.airport, ready: !!m.airport && !!m.flight_budget })),
      comparison: row ? await publicComparison(c, row, trip, list, uid) : null,
      savedFinal: final ? await publicComparison(c, final, trip, list, uid) : null,
    };
  });
}
export async function financial(m: Member): Promise<Financial> {
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
    const last = await latest(c, id);
    await settle(c, last, trip, list);
    if (last?.status === 'voting' && last.revision === trip.revision && last.discovery) return { existing: last.id };
    const final = last?.status === 'final' ? last : await savedFinal(c, id);
    if (final?.ballot.finalConfirmedAt) throw new TravelError('The meeting place is confirmed. New comparisons are locked.', 409);
    if (final && final.ballot.redraw.filter(uid => list.some(m => m.user_id === uid)).length < majority(list.length)) {
      throw new TravelError('Ask the group for new options first. A majority must agree before replacing the saved destination.', 409);
    }
    if (last?.status === 'generating' && last.discovery && last.revision === trip.revision && Date.now() - new Date(last.created_at).getTime() < SEARCH_LEASE_MS) return { existing: last.id };
    // Keep rejected destinations out of retries until the travel settings change.
    const excluded = new Set<string>();
    if (last?.revision === trip.revision) {
      for (const airport of Array.isArray(last.envelope.excludedAirports) ? last.envelope.excludedAirports : []) {
        if (validAirport(airport)) excluded.add(airport);
      }
      if (last.status === 'vetoed') {
        const progress = ballotProgress(last.options, await ballots(c, last.id), eligibleIds(last, list), last.ballot);
        for (const option of last.options) if (progress.removedOptionIds.includes(option.id)) excluded.add(option.airport);
      }
    }
    if (final?.revision === trip.revision) {
      const airport = final.options.find(option => option.id === final.winner_id)?.airport;
      if (airport) excluded.add(airport);
    }
    const excludedAirports = [...excluded].sort();
    const candidates = discoveryShortlist(list.map(m=>m.airport!), dates, excludedAirports);
    if (!candidates.length) throw new TravelError('No new supported destinations remain for these settings. Change shared dates or review your setup before trying again.', 422);
    await c.query("update travel_comparisons set status='stale' where trip_id=$1 and status in ('generating','voting','vetoed')", [id]);
    const row = await one(c, "insert into travel_comparisons(trip_id,revision,status,member_ids,options) values($1,$2,'generating',$3,$4::jsonb) returning id", [id, trip.revision, list.map(m => m.user_id), JSON.stringify({version:2,options:[],summary:null,excludedAirports})]);
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
      await c.query("update travel_comparisons set status=$2,options=$3::jsonb,checked_at=$5,expires_at=$6,error=$4 where id=$1", [claim.comparisonId, complete ? 'voting' : 'failed', JSON.stringify({...last.envelope,version:2,options,summary,ballot:{deadline:new Date(Date.now()+86400000).toISOString(),confirmed:[],redraw:[]}}), complete ? null : discoveryFailure(quotes), new Date(Math.min(...funds.map(f => f.checkedAt))).toISOString(), new Date(Math.min(Date.now(), ...options.flatMap(o => o.routes.filter(r => !r.local).map(r => Date.parse(r.quotedAt)))) + 15 * 60 * 1000).toISOString()]);
      return { comparisonId: claim.comparisonId };
    });
  } catch (e) {
    await q("update travel_comparisons set status='failed',error='Comparison could not finish. Please try again.' where id=$1 and status='generating'", [claim.comparisonId]);
    throw e;
  }
}
/** Settle and commit an elapsed deadline before rejecting a late action. */
async function withOpenBallot(id: number, uid: number, comparisonId: number, action: (c: PoolClient, row: Comparison, trip: Trip, list: Member[]) => Promise<void>) {
  const result = await locked(id, uid, async (c, trip) => {
    const row = await latest(c, id);
    const list = await members(c, id);
    await settle(c, row, trip, list);
    if (row?.status !== 'voting' && row?.id === comparisonId) return { closed: true };
    usable(row, trip);
    if (row.id !== comparisonId || !eligibleIds(row, list).includes(uid)) throw new TravelError('This comparison is out of date or you are not included.', 409);
    await action(c, row, trip, list);
    return { closed: false };
  });
  if (result.closed) throw new TravelError('Voting is closed.', 409);
  return { ok: true };
}
export async function castVote(id: number, uid: number, body: any) {
  const comparisonId = positiveId(body?.comparisonId), optionId = positiveId(body?.optionId);
  if (!['approve','veto',null].includes(body?.value)) throw new TravelError('Vote must be approve, veto or null.');
  return withOpenBallot(id, uid, comparisonId, async (c, row, trip, list) => {
    const votes = await ballots(c, row.id);
    const progress = ballotProgress(row.options, votes, eligibleIds(row, list), row.ballot, uid);
    if (progress.myConfirmed) throw new TravelError('Your votes are confirmed and cannot be changed.', 409);
    if (!row.options.some(o => o.id === optionId && o.complete) || progress.removedOptionIds.includes(optionId)) throw new TravelError('This option is no longer available for voting.', 409);
    if (body.value === null) await c.query('delete from travel_votes where comparison_id=$1 and user_id=$2 and option_id=$3', [comparisonId, uid, optionId]);
    else await c.query('insert into travel_votes(comparison_id,user_id,option_id,value) values($1,$2,$3,$4) on conflict(comparison_id,user_id,option_id) do update set value=excluded.value', [comparisonId, uid, optionId, body.value]);
    await settle(c, row, trip, list);
  });
}
export async function confirmBallot(id: number, uid: number, body: any) {
  return withOpenBallot(id, uid, positiveId(body?.comparisonId), async (c, row, trip, list) => {
    const progress = ballotProgress(row.options, await ballots(c, row.id), eligibleIds(row, list), row.ballot, uid);
    if (progress.myConfirmed) return;
    if (!progress.canConfirm) throw new TravelError('Vote on every remaining destination before confirming.', 409);
    row.ballot.confirmed.push(uid);
    await saveBallot(c, row);
    await settle(c, row, trip, list);
  });
}
export async function closeComparison(id: number, uid: number, body: any) {
  // Check organizer before closing/settling through the common mutation path.
  await locked(id, uid, async (_c, trip) => organizer(trip, uid));
  return withOpenBallot(id, uid, positiveId(body?.comparisonId), async (c, row, trip, list) => {
    organizer(trip, uid);
    await settle(c, row, trip, list, true);
  });
}
export async function requestRedraw(id: number, uid: number, body: any) {
  return locked(id, uid, async (c, trip) => {
    const row = await savedFinal(c, id);
    if (!row || row.id !== positiveId(body?.comparisonId)) throw new TravelError('This saved destination is no longer current.', 409);
    if (row.ballot.finalConfirmedAt) throw new TravelError('The meeting place is confirmed. New options are locked.', 409);
    const current = await latest(c, id);
    if (current && current.id !== row.id && ['generating','voting'].includes(current.status) && current.revision === trip.revision) throw new TravelError('The replacement comparison is already in progress.', 409);
    const list = await members(c, id);
    row.ballot.redraw = row.ballot.redraw.filter(id => list.some(m => m.user_id === id));
    row.ballot.redraw = row.ballot.redraw.includes(uid) ? row.ballot.redraw.filter(id => id !== uid) : [...row.ballot.redraw, uid];
    await saveBallot(c, row);
    return { ok: true, ready: row.ballot.redraw.length >= majority(list.length) };
  });
}

export async function confirmFinal(id: number, uid: number, body: any) {
  return locked(id, uid, async (c, trip) => {
    organizer(trip, uid);
    const row = await savedFinal(c, id);
    if (!row || row.id !== positiveId(body?.comparisonId)) throw new TravelError('There is no matching final destination to confirm.', 409);
    const current = await latest(c, id);
    if (current && current.id !== row.id && ['generating','voting'].includes(current.status) && current.revision === trip.revision) throw new TravelError('Finish the replacement comparison before confirming.', 409);
    if (row.revision !== trip.revision) throw new TravelError('Trip settings changed. Find updated options before confirming.', 409);
    if (!row.ballot.finalConfirmedAt) {
      row.ballot.finalConfirmedAt = new Date().toISOString();
      await saveBallot(c, row);
    }
    return { ok: true };
  });
}
