import { q1 } from "@/lib/db";
import { fail, json } from "@/lib/api";
import { setSession } from "@/lib/session";

export async function POST() {
  let u: { id: number } | null;
  try {
    u = await q1<{ id: number }>("select id from users where email='demo@wsp.app'");
  } catch (e) {
    console.error("demo login: database unreachable", e);
    return fail("can't reach the database, check DATABASE_URL or your network", 503);
  }
  if (!u) return fail("demo user missing, run npm run db:setup", 500);
  await setSession(u.id);
  return json({ ok: true });
}
