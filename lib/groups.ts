import { q, q1 } from "@/lib/db";
import { duesInGroup } from "@/lib/payments";

type Result = { ok: true } | { error: string; status: number };
const err = (error: string, status: number): Result => ({ error, status });

/** Owner-only. Deleting the row cascades to memberships, rounds, plans, votes, payments and skips; the invite code goes with it. */
export async function deleteGroup(groupId: number, userId: number): Promise<Result> {
  const g = await q1<{ created_by: number }>("select created_by from groups where id=$1", [groupId]);
  if (!g) return err("group not found", 404);
  if (g.created_by !== userId) return err("only the owner can delete this group", 403);
  // The owner check is repeated in the statement so a concurrent ownership transfer can't be raced.
  const gone = await q1("delete from groups where id=$1 and created_by=$2 returning id", [groupId, userId]);
  return gone ? { ok: true } : err("ownership changed, try again", 409);
}

/** Removes the member plus their votes and skips in this group's rounds. Their availability goes with the membership row. */
export async function leaveGroup(groupId: number, userId: number, newOwnerId?: number): Promise<Result> {
  const g = await q1<{ created_by: number }>("select created_by from groups where id=$1", [groupId]);
  if (!g) return err("group not found", 404);
  if (!(await q1("select 1 from memberships where group_id=$1 and user_id=$2", [groupId, userId]))) return err("not in this group", 403);
  // Unpaid dues block leaving, owner or not (the owner check below comes after, so a transfer of ownership can't skip it).
  // A payer who is still owed money may leave: rounds.payer_id and the others' 'owed' rows stay, and members can still pay them
  // because payments resolve the payer through users, not memberships. The catch: the final screen looks the payer up among current
  // members, so their name shows as missing there.
  const dues = await duesInGroup(groupId, userId);
  if (dues > 0) return err(`You owe $${dues.toFixed(2)} in this group. Pay your dues before leaving.`, 409);
  const others = await q<{ user_id: number }>("select user_id from memberships where group_id=$1 and user_id<>$2", [groupId, userId]);
  const owner = g.created_by === userId;
  if (owner) {
    if (!others.length) return err("You're the only member. Delete the group instead.", 400);
    if (newOwnerId === undefined) return err("Pick a new owner before leaving.", 400);
    if (!others.some(m => m.user_id === newOwnerId)) return err("new owner must be another member of this group", 400);
  }
  // One statement so ownership transfer and removal succeed or fail together. The guards re-check
  // ownership, so a stale read can't let the owner leave without a transfer.
  const left = await q1(
    `with xfer as (
       update groups set created_by=$3 where id=$1 and created_by=$2 and $4::boolean
         and exists (select 1 from memberships where group_id=$1 and user_id=$3) returning id),
     gone as (
       delete from memberships where group_id=$1 and user_id=$2
         and (exists (select 1 from xfer) or (not $4::boolean and not exists (select 1 from groups where id=$1 and created_by=$2)))
       returning user_id),
     v as (
       delete from votes where user_id=$2 and exists (select 1 from gone)
         and plan_id in (select p.id from plans p join plan_rounds r on r.id=p.round_id where r.group_id=$1)),
     s as (
       delete from stop_skips where user_id=$2 and exists (select 1 from gone)
         and round_id in (select id from plan_rounds where group_id=$1))
     select user_id from gone`,
    [groupId, userId, newOwnerId ?? null, owner]);
  return left ? { ok: true } : err("ownership changed, try again", 409);
}
