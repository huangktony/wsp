import { q1 } from "@/lib/db";
import { fail, json } from "@/lib/api";
import { setSession } from "@/lib/session";

export async function POST() {
  const u = await q1<{ id: number }>("select id from users where email='demo@wsp.app'");
  if (!u) return fail("demo user missing, run npm run db:setup", 500);
  await setSession(u.id);
  return json({ ok: true });
}
