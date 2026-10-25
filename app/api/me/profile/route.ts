import { fail, json, requireUser } from "@/lib/api";
import { ProfileBody, updateProfile } from "@/lib/profile";

export async function PATCH(req: Request) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const p = ProfileBody.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "bad input");
  await updateProfile(uid, p.data);
  return json({ ok: true });
}
