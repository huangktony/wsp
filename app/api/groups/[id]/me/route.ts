import { z } from "zod";
import { q, q1 } from "@/lib/db";
import { SLOTS } from "@/lib/constants";
import { fail, isMember, json, requireUser } from "@/lib/api";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const id = Number((await params).id);
  const m = await q1<any>("select m.availability, u.interests, u.max_distance_mi, u.budget_tier from memberships m join users u on u.id=m.user_id where m.group_id=$1 and m.user_id=$2", [id, uid]);
  return m ? json(m) : fail("not in this group", 403);
}
const Body = z.object({ availability: z.array(z.enum(SLOTS)), interests: z.array(z.string()).max(12), max_distance_mi: z.number().int().min(1).max(100) });
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const id = Number((await params).id);
  if (!(await isMember(id, uid))) return fail("not in this group", 403);
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("bad input");
  await q("update memberships set availability=$1 where group_id=$2 and user_id=$3", [JSON.stringify(p.data.availability), id, uid]);
  await q("update users set interests=$1, max_distance_mi=$2 where id=$3", [p.data.interests, p.data.max_distance_mi, uid]);
  return json({ ok: true });
}
