import { q, q1 } from "@/lib/db";
import { fail, json, requireUser } from "@/lib/api";

// The person who paid up front nudges everyone still marked 'owed'. They see it on their Groups screen and the final plan.
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const id = Number((await params).id);
  const round = await q1<any>("select id,payer_id,requests_sent from plan_rounds where group_id=$1 and status='final' order by id desc limit 1", [id]);
  if (!round) return fail("no final plan yet", 409);
  if (round.payer_id !== uid) return fail("only the person paying up front sends reminders", 403);
  if (!round.requests_sent) return fail("send the payment requests first", 409);
  const rows = await q("update payments set reminded_at=now() where round_id=$1 and status='owed' returning id", [round.id]);
  return json({ reminded: rows.length });
}
