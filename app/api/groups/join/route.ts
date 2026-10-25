import { q, q1 } from "@/lib/db";
import { fail, json, requireUser } from "@/lib/api";

export async function POST(req: Request) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const b = await req.json().catch(() => ({}));
  const g = await q1<{ id: number }>("select id from groups where upper(invite_code)=$1", [String(b.code ?? "").trim().toUpperCase()]);
  if (!g) return fail("no group with that code", 404);
  await q("insert into memberships(group_id,user_id) values($1,$2) on conflict do nothing", [g.id, uid]);
  return json({ id: g.id });
}
