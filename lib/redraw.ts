import { snapshotTime } from "./availability";
import { roundSettings, searchPreferences } from "./roundSettings";
import { hasSearchMetadata } from "./pipeline";
import { pool, q1 } from "./db";
import {
  REDRAW_MESSAGES,
  redrawGate,
  redrawThreshold,
  shouldRedraw,
} from "./redrawRules";

// Group vote to redraw a FINAL plan. Server only.
// A member taps to add or take back a vote. When votes reach more than half
// of the CURRENT members, a new round starts that leaves out the old winner's
// places. Everything that must be atomic happens in one transaction holding
// the same per-group advisory lock that startRound uses, and the old round is
// flipped to 'redrawn' with a single conditional UPDATE. That flip is also
// what makes sending the split for the old round impossible: "send" claims
// the same row first, so exactly one of them wins.

export class RedrawError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** `locked` is why a redraw is no longer possible, or false. */
export type RedrawStatus = {
  locked: false | "confirmed" | "locked";
  votes: number;
  members: number;
  needed: number;
  mine: boolean;
};

/** Counts only, never names. null unless the authoritative round is final. */
export async function redrawStatus(
  groupId: number,
  userId: number,
): Promise<RedrawStatus | null> {
  const r = await q1<any>(
    `select r.id,r.status,r.requests_sent,to_jsonb(r)->>'confirmed_at' confirmed_at,
       (select count(*)::int from memberships where group_id=r.group_id) members,
       (select count(*)::int from redraw_votes v join memberships m on m.user_id=v.user_id and m.group_id=r.group_id where v.round_id=r.id) votes,
       exists(select 1 from redraw_votes where round_id=r.id and user_id=$2) mine
     from plan_rounds r
     where r.group_id=$1
     order by (r.status='final') desc,r.id desc
     limit 1`,
    [groupId, userId],
  );

  if (!r || r.status !== "final") return null;

  const gate = redrawGate(r);
  return {
    locked:
      gate === "ok" ? false : gate === "confirmed" ? "confirmed" : "locked",
    votes: r.votes,
    members: r.members,
    needed: redrawThreshold(r.members),
    mine: r.mine,
  };
}

export type ToggleResult =
  | ({ started: false } & RedrawStatus)
  | { started: true; roundId: number; oldRoundId: number };

/** Adds the member's vote, or takes it back if they already voted. Starts a new round when the threshold is reached. */
export async function toggleRedrawVote(
  groupId: number,
  userId: number,
): Promise<ToggleResult> {
  const c = await pool.connect();

  try {
    await c.query("begin");
    await c.query("select pg_advisory_xact_lock(4242, $1)", [groupId]);

    const membership = await c.query(
      "select 1 from memberships where group_id=$1 and user_id=$2",
      [groupId, userId],
    );
    if (!membership.rows.length) {
      throw new RedrawError("not in this group", 403);
    }

    // confirmed_at is read through JSON so this works before the vote confirmation migration.
    const last = (
      await c.query(
        `select id,status,attempt,excluded,requests_sent,to_jsonb(r)->'search_settings' search_settings,
           to_jsonb(r)->>'confirmed_at' confirmed_at
         from plan_rounds r
         where group_id=$1
         order by (status='final') desc,id desc
         limit 1`,
        [groupId],
      )
    ).rows[0];

    const gate = redrawGate(last);
    if (gate !== "ok") {
      throw new RedrawError(REDRAW_MESSAGES[gate], 409);
    }

    const removed = await c.query(
      "delete from redraw_votes where round_id=$1 and user_id=$2",
      [last.id, userId],
    );

    if (!removed.rowCount) {
      await c.query(
        "insert into redraw_votes(round_id,user_id) values($1,$2) on conflict do nothing",
        [last.id, userId],
      );
    }

    const tally = (
      await c.query(
        `select
           (select count(*)::int from memberships where group_id=$1) members,
           (select count(*)::int
            from redraw_votes v
            join memberships m on m.user_id=v.user_id and m.group_id=$1
            where v.round_id=$2) votes`,
        [groupId, last.id],
      )
    ).rows[0];

    if (!shouldRedraw(tally.votes, tally.members)) {
      await c.query("commit");

      return {
        started: false,
        locked: false,
        votes: tally.votes,
        members: tally.members,
        needed: redrawThreshold(tally.members),
        mine: !removed.rowCount,
      };
    }

    // Threshold reached. Flip the old round in ONE conditional statement:
    // if the payer's "send" or the creator's "confirm" got there first, this matches nothing.
    const flipped = await c.query(
      `update plan_rounds r set status='redrawn'
       where id=$1 and status='final' and requests_sent=false
         and to_jsonb(r)->>'confirmed_at' is null
       returning winner_plan_id`,
      [last.id],
    );

    if (!flipped.rowCount) {
      const now = (
        await c.query(
          "select status,requests_sent,to_jsonb(r)->>'confirmed_at' confirmed_at from plan_rounds r where id=$1",
          [last.id],
        )
      ).rows[0];
      const why = redrawGate(now);
      throw new RedrawError(
        REDRAW_MESSAGES[why === "ok" ? "locked" : why],
        409,
      );
    }

    const places = (
      await c.query(
        "select distinct s->>'place' place from plans p, jsonb_array_elements(p.stops) s where p.id=$1",
        [flipped.rows[0].winner_plan_id],
      )
    ).rows.map((x) => x.place as string);

    const excluded = [...new Set([...(last.excluded ?? []), ...places])];

    // A redraw is a new search: snapshot the current city and settings under
    // the same group lock as startRound so arriving clients reuse this round.
    if (!(await hasSearchMetadata((sql, args) => c.query(sql, args)))) {
      throw new RedrawError(
        "Plan search needs a database update. Ask the group organizer to apply the round search migration.",
        503,
      );
    }

    const group = (
      await c.query("select city from groups where id=$1 for share", [
        groupId,
      ])
    ).rows[0];

    const city = group?.city?.trim();
    if (!city) {
      throw new RedrawError("Add a city to your group", 400);
    }

    const members = (
      await c.query(
        "select m.user_id,m.availability,m.comfort_tier,u.name,u.budget_tier,u.interests,u.max_distance_mi,to_jsonb(m)->'preferences' preferences from memberships m join users u on u.id=m.user_id where m.group_id=$1 order by m.user_id",
        [groupId],
      )
    ).rows;

    const settings = roundSettings(members);
    const preferences = searchPreferences(settings);

    if (!preferences?.distance) {
      throw new RedrawError(
        "Finish your setup before finding plans.",
        409,
      );
    }

    const timeMatch = snapshotTime(settings, last);
    if (!timeMatch) throw new RedrawError("No available window lasts two hours. Add a longer range to find plans.", 409);
    const created = await c.query(
      "insert into plan_rounds(group_id,status,attempt,excluded,search_city,search_distance_mi,sample_places,group_tier,search_settings,slot) values($1,'generating',$2,$3,$4,$5,$6,$7,$8::jsonb,$9) returning id",
      [
        groupId,
        last.attempt + 1,
        excluded,
        city,
        preferences.distance,
        process.env.USE_SAMPLE_PLACES === "true",
        preferences.tier,
        JSON.stringify(settings),
        timeMatch?.slot ?? null,
      ],
    );

    await c.query("commit");

    return {
      started: true,
      roundId: created.rows[0].id,
      oldRoundId: last.id,
    };
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** The new plans could not be made: restore the final plan and clear redraw votes if no newer search has taken over. */
export async function undoRedraw(
  oldRoundId: number,
  failedRoundId: number,
): Promise<void> {
  const c = await pool.connect();

  try {
    await c.query("begin");

    const old = (
      await c.query("select group_id from plan_rounds where id=$1", [
        oldRoundId,
      ])
    ).rows[0];

    if (old) {
      await c.query("select pg_advisory_xact_lock(4242, $1)", [
        old.group_id,
      ]);

      // A later settings edit/retry owns the group now; an older failed
      // provider call must not restore a final over that newer search.
      const latest = (
        await c.query(
          "select id,status from plan_rounds where group_id=$1 order by id desc limit 1",
          [old.group_id],
        )
      ).rows[0];

      if (latest?.id === failedRoundId && latest.status === "failed") {
        await c.query(
          "update plan_rounds set status='final' where id=$1 and status='redrawn'",
          [oldRoundId],
        );
        await c.query("delete from redraw_votes where round_id=$1", [
          oldRoundId,
        ]);
      }
    }

    await c.query("commit");
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}