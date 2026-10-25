import { q1 } from "@/lib/db";
import { fail, json, requireUser } from "@/lib/api";
import { votingSchemaReady, VotingSchemaPendingError } from "@/lib/voting";

/**
 * Creator-only "Confirm final plan". Saves the winning plan as final with the time it was confirmed.
 * After this the group can't redraw it, and the payer can send payment requests.
 * One conditional UPDATE: a group redraw flips the same row away from 'final', so only one of them can win.
 */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const id = Number((await params).id);
  const g = await q1<any>("select created_by from groups where id=$1", [id]);
  if (!g || g.created_by !== uid) return fail("only the group creator can confirm the plan", 403);
  if (!(await votingSchemaReady())) return fail(new VotingSchemaPendingError().message, 503);

  const round = await q1<any>("select id,status,confirmed_at from plan_rounds where group_id=$1 and status<>'failed' order by id desc limit 1", [id]);
  if (!round || round.status !== "final") return fail("no final plan to confirm", 409);
  if (round.confirmed_at) return json({ confirmed_at: round.confirmed_at });

  const done = await q1<any>(
    "update plan_rounds set confirmed_at=now(), confirmed_by=$2 where id=$1 and status='final' and confirmed_at is null returning confirmed_at",
    [round.id, uid]);
  if (!done) return fail("This plan can no longer be confirmed. The group may be redrawing it.", 409);
  return json({ confirmed_at: done.confirmed_at });
}
