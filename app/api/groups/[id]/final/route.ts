import { includedInRound, VOTE_SETUP_MESSAGE } from "@/lib/roundParticipation";
import { q1 } from "@/lib/db";
import { fail, json, requireUser, setupDone } from "@/lib/api";
import { settleRound } from "@/lib/pipeline";

// Creator-only "Close voting now". Normally voting closes by itself at the deadline or once everyone has voted.
// Picks the winner, or marks the round vetoed if every plan was vetoed.
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const id = Number((await params).id);
  const g = await q1<any>("select created_by from groups where id=$1", [id]);
  if (!g || g.created_by !== uid) return fail("only the group creator can close voting", 403);
  const round = await q1<any>("select id,status,to_jsonb(r)->'search_settings' search_settings from plan_rounds r where group_id=$1 and status<>'failed' order by id desc limit 1", [id]);
  if (!round || round.status !== "voting") return fail("no open round", 409);
  if (!includedInRound(round, uid) || !(await setupDone(id, uid))) return fail(VOTE_SETUP_MESSAGE, 409);
  return json({ status: await settleRound(round.id, true) });
}
