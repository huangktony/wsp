import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { q1 } from "./db";

const NAME = "wsp_session";
const secret = () => process.env.SESSION_SECRET || "dev-secret-change-me";
const sign = (v: string) => createHmac("sha256", secret()).update(v).digest("base64url");

export async function setSession(userId: number) {
  const v = String(userId);
  (await cookies()).set(NAME, `${v}.${sign(v)}`, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 14 });
}
export async function clearSession() {
  (await cookies()).delete(NAME);
}
export async function currentUserId(): Promise<number | null> {
  const raw = (await cookies()).get(NAME)?.value;
  if (!raw) return null;
  const [v, sig] = raw.split(".");
  if (!v || !sig) return null;
  const a = Buffer.from(sig), b = Buffer.from(sign(v));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return Number(v);
}
export type Me = { id: number; name: string; email: string; budget_tier: string | null; avg_outing_cost: number | null; max_distance_mi: number; interests: string[]; nessie_account_id: string | null; avatar: string | null };
export async function currentUser(): Promise<Me | null> {
  const id = await currentUserId();
  if (!id) return null;
  return q1<Me>("select id,name,email,budget_tier,avg_outing_cost::float,max_distance_mi,interests,nessie_account_id,avatar from users where id=$1", [id]);
}
