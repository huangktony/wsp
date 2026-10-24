import { z } from "zod";
import { q } from "@/lib/db";
import { fail, json, requireUser } from "@/lib/api";
import { currentUser } from "@/lib/session";

export async function GET() {
  const me = await currentUser();
  return me ? json(me) : fail("not signed in", 401);
}
const Body = z.object({ max_distance_mi: z.number().int().min(1).max(100), interests: z.array(z.string()).max(12) });
export async function PUT(req: Request) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("bad input");
  await q("update users set max_distance_mi=$1, interests=$2 where id=$3", [p.data.max_distance_mi, p.data.interests, uid]);
  return json({ ok: true });
}
