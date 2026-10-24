import bcrypt from "bcryptjs";
import { z } from "zod";
import { q1 } from "@/lib/db";
import { fail, json } from "@/lib/api";
import { setSession } from "@/lib/session";

const Body = z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(6) });

export async function POST(req: Request) {
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("name, valid email and 6+ char password required");
  if (await q1("select 1 from users where email=$1", [p.data.email.toLowerCase()])) return fail("email already in use", 409);
  const u = await q1<{ id: number }>("insert into users(name,email,password_hash) values($1,$2,$3) returning id", [p.data.name, p.data.email.toLowerCase(), await bcrypt.hash(p.data.password, 10)]);
  await setSession(u!.id);
  return json({ ok: true });
}
