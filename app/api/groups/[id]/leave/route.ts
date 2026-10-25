import { z } from "zod";
import { fail, json, requireUser } from "@/lib/api";
import { leaveGroup } from "@/lib/groups";

const Body = z.object({ newOwnerId: z.number().int().optional() });
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const id = Number((await params).id);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail("bad input");
  const r = await leaveGroup(id, uid, p.data.newOwnerId);
  return "error" in r ? fail(r.error, r.status) : json(r);
}
