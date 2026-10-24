import bcrypt from "bcryptjs";
import { q1 } from "@/lib/db";
import { fail, json } from "@/lib/api";
import { setSession } from "@/lib/session";

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const u = await q1<{ id: number; password_hash: string }>("select id,password_hash from users where email=$1", [String(b.email ?? "").toLowerCase()]);
  if (!u || !(await bcrypt.compare(String(b.password ?? ""), u.password_hash))) return fail("wrong email or password", 401);
  await setSession(u.id);
  return json({ ok: true });
}
