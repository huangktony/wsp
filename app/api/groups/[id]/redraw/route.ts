import { SETUP_REQUIRED_MESSAGE } from "@/lib/finding";
import { fail, json, requireUser, setupDone } from "@/lib/api";
import { maskKey } from "@/lib/nessie";
import { NoPlacesError, fillRound } from "@/lib/pipeline";
import { RedrawError, toggleRedrawVote, undoRedraw } from "@/lib/redraw";

export const maxDuration = 60;

/**
 * Vote to throw away the FINAL plan and get new ones, or take that vote back (tap again).
 * 409 unless the latest round is final and its payment requests are not sent. 403 for a non-member.
 * The vote that reaches more than half of the members starts the new round, which leaves out the old winner's places.
 */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const id = Number((await params).id);
  if (!(await setupDone(id, uid))) return fail(SETUP_REQUIRED_MESSAGE, 409);
  let result;
  try {
    result = await toggleRedrawVote(id, uid);
  } catch (e) {
    if (e instanceof RedrawError) return fail(e.message, e.status);
    throw e;
  }
  if (!result.started) return json(result);
  try {
    await fillRound(result.roundId);
  } catch (e: any) {
    await undoRedraw(result.oldRoundId);
    if (e instanceof NoPlacesError) return fail(e.message, 422);
    console.error(maskKey(`redraw failed: ${e?.message ?? e}`));
    return fail("Couldn't make new plans this time. Your final plan is unchanged, try again.", 502);
  }
  return json({ started: true });
}
