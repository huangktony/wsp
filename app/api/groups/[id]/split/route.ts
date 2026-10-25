import { q, q1 } from "@/lib/db";
import { fail, isMember, json, requireUser } from "@/lib/api";
import { computeSplit } from "@/lib/pipeline";
import { maskKey, recordHangout } from "@/lib/nessie";

/**
 * Screen 10 split actions on the winning plan. Body is one of:
 *   { action: "mode", mode: "even" | "items" }   payer only
 *   { action: "skip", stop: number, skip: bool }  any member, for themselves
 *   { action: "send" }                            payer only: creates the payment requests
 * Nothing can change after requests are sent.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const id = Number((await params).id);
  if (!(await isMember(id, uid))) return fail("not in this group", 403);
  const round = await q1<any>(
    "select r.id,r.status,r.payer_id,r.requests_sent,jsonb_array_length(p.stops) n from plan_rounds r join plans p on p.id=r.winner_plan_id where r.group_id=$1 and r.status='final' order by r.id desc limit 1", [id]);
  if (!round) return fail("no final plan yet", 409);
  if (round.requests_sent) return fail("requests were already sent", 409);
  const body = await req.json().catch(() => ({}));
  const isPayer = round.payer_id === uid;

  if (body.action === "mode") {
    if (!isPayer) return fail("only the person paying up front picks the split", 403);
    if (body.mode !== "even" && body.mode !== "items") return fail("mode must be even or items");
    await q("update plan_rounds set split_mode=$1 where id=$2", [body.mode, round.id]);
  } else if (body.action === "skip") {
    const stop = Number(body.stop);
    if (!Number.isInteger(stop) || stop < 0 || stop >= round.n) return fail("bad stop");
    if (body.skip) await q("insert into stop_skips(round_id,user_id,stop_index) values($1,$2,$3) on conflict do nothing", [round.id, uid, stop]);
    else await q("delete from stop_skips where round_id=$1 and user_id=$2 and stop_index=$3", [round.id, uid, stop]);
  } else if (body.action === "send") {
    if (!isPayer) return fail("only the person paying up front sends requests", 403);
    const split = (await computeSplit(round.id))!;
    // Record the up-front payment on the payer's account first. If Nessie fails, nothing is saved and requests_sent stays false, so the payer can retry.
    const info = await q1<any>("select p.title, u.nessie_account_id from plan_rounds r join plans p on p.id=r.winner_plan_id join users u on u.id=r.payer_id where r.id=$1", [round.id]);
    try {
      await recordHangout(info.nessie_account_id, round.id, info.title, split.total);
    } catch (e: any) {
      console.error(maskKey(`recording the up-front payment failed: ${e?.message ?? e}`));
      return fail("Couldn't record the payment with the bank service, try again", 502);
    }
    for (const r of split.rows) {
      if (r.user_id === uid || r.amount <= 0) continue;
      await q("insert into payments(round_id,user_id,amount) values($1,$2,$3) on conflict (round_id,user_id) do update set amount=excluded.amount, status='owed'",
        [round.id, r.user_id, r.amount]);
    }
    await q("update plan_rounds set requests_sent=true, requests_sent_at=now(), bill_total=$2 where id=$1", [round.id, split.total]);
  } else return fail("unknown action");
  return json({ ok: true });
}
