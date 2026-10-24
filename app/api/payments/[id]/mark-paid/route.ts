import { q1 } from "@/lib/db";
import { fail, json, requireUser } from "@/lib/api";

// Demo state only. No money moves.
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const r = await q1("update payments set status='paid' where id=$1 and user_id=$2 returning id", [Number((await params).id), uid]);
  return r ? json({ ok: true }) : fail("not your payment", 403);
}
