// Group vote to redraw a FINAL plan. Server only.
// A member taps to add or take back a vote. When votes reach more than half of the CURRENT members, a new round starts that leaves
// out the old winner's places. Everything that must be atomic happens in one transaction holding the same per-group advisory lock
// that startRound uses, and the old round is flipped to 'redrawn' with a single conditional UPDATE. That flip is also what
// makes sending the split for the old round impossible: "send" claims the same row first, so exactly one of them wins.
import { pool, q, q1 } from "./db";
import { REDRAW_MESSAGES, redrawGate, redrawThreshold, shouldRedraw } from "./redrawRules";

export class RedrawError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** `locked` is why a redraw is no longer possible, or false. */
export type RedrawStatus = { locked: false | "confirmed" | "locked"; votes: number; members: number; needed: number; mine: boolean };

/** Counts only, never names. null unless the latest round is final. */
export async function redrawStatus(groupId: number, userId: number): Promise<RedrawStatus | null> {
  const r = await q1<any>(
    `select r.id,r.status,r.requests_sent,to_jsonb(r)->>'confirmed_at' confirmed_at,
       (select count(*)::int from memberships where group_id=r.group_id) members,
       (select count(*)::int from redraw_votes v join memberships m on m.user_id=v.user_id and m.group_id=r.group_id where v.round_id=r.id) votes,
       exists(select 1 from redraw_votes where round_id=r.id and user_id=$2) mine
     from plan_rounds r where r.group_id=$1 and r.status<>'failed' order by r.id desc limit 1`, [groupId, userId]);
  if (!r || r.status !== "final") return null;
  const gate = redrawGate(r);
  return { locked: gate === "ok" ? false : gate === "confirmed" ? "confirmed" : "locked", votes: r.votes, members: r.members, needed: redrawThreshold(r.members), mine: r.mine };
}

export type ToggleResult = ({ started: false } & RedrawStatus) | { started: true; roundId: number; oldRoundId: number };

/** Adds the member's vote, or takes it back if they already voted. Starts a new round when the threshold is reached. */
export async function toggleRedrawVote(groupId: number, userId: number): Promise<ToggleResult> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select pg_advisory_xact_lock(4242, $1)", [groupId]);
    if (!(await c.query("select 1 from memberships where group_id=$1 and user_id=$2", [groupId, userId])).rows.length) throw new RedrawError("not in this group", 403);

    const last = (await c.query("select id,status,attempt,excluded,requests_sent,to_jsonb(r)->>'confirmed_at' confirmed_at from plan_rounds r where group_id=$1 and status<>'failed' order by id desc limit 1", [groupId])).rows[0];
    const gate = redrawGate(last);
    if (gate !== "ok") throw new RedrawError(REDRAW_MESSAGES[gate], 409);

    const removed = await c.query("delete from redraw_votes where round_id=$1 and user_id=$2", [last.id, userId]);
    if (!removed.rowCount) await c.query("insert into redraw_votes(round_id,user_id) values($1,$2) on conflict do nothing", [last.id, userId]);

    const tally = (await c.query(
      `select (select count(*)::int from memberships where group_id=$1) members,
              (select count(*)::int from redraw_votes v join memberships m on m.user_id=v.user_id and m.group_id=$1 where v.round_id=$2) votes`, [groupId, last.id])).rows[0];

    if (!shouldRedraw(tally.votes, tally.members)) {
      await c.query("commit");
      return { started: false, locked: false, votes: tally.votes, members: tally.members, needed: redrawThreshold(tally.members), mine: !removed.rowCount };
    }

    // Threshold reached. Flip the old round in ONE conditional statement: if the payer's "send" or the creator's "confirm" got there
    // first, this matches nothing. confirmed_at is read through JSON so this works before the vote confirmation migration.
    const flipped = await c.query("update plan_rounds r set status='redrawn' where id=$1 and status='final' and requests_sent=false and to_jsonb(r)->>'confirmed_at' is null returning winner_plan_id", [last.id]);
    if (!flipped.rowCount) {
      const now = (await c.query("select status,requests_sent,to_jsonb(r)->>'confirmed_at' confirmed_at from plan_rounds r where id=$1", [last.id])).rows[0];
      const why = redrawGate(now);
      throw new RedrawError(REDRAW_MESSAGES[why === "ok" ? "locked" : why], 409);
    }
    const places = (await c.query("select distinct s->>'place' place from plans p, jsonb_array_elements(p.stops) s where p.id=$1", [flipped.rows[0].winner_plan_id])).rows.map((x) => x.place as string);
    const excluded = [...new Set([...(last.excluded ?? []), ...places])];
    const created = await c.query("insert into plan_rounds(group_id,status,attempt,excluded) values($1,'generating',$2,$3) returning id", [groupId, last.attempt + 1, excluded]);
    await c.query("commit");
    return { started: true, roundId: created.rows[0].id, oldRoundId: last.id };
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** The new plans could not be made: put the group back on its final plan and clear the votes, so it can simply try again. */
export async function undoRedraw(oldRoundId: number): Promise<void> {
  await q("update plan_rounds set status='final' where id=$1 and status='redrawn'", [oldRoundId]);
  await q("delete from redraw_votes where round_id=$1", [oldRoundId]);
}
