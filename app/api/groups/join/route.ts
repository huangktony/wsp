import { normalizeInviteCode } from "@/lib/inviteCodeInput";
import { q, q1 } from "@/lib/db";
import { fail, json, requireUser } from "@/lib/api";

export async function POST(req: Request) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const b = await req.json().catch(() => ({}));
  const original = String(b?.code ?? "").trim().toUpperCase();
  const normalized = normalizeInviteCode(original);
  let g = await q1<{ id: number }>("select id from groups where upper(invite_code)=$1", [original]);
  // Preserve exact legacy codes while accepting dashed, dashless, and suffix-only WSP codes.
  if (!g && normalized && normalized !== original) g = await q1<{ id: number }>("select id from groups where upper(invite_code)=$1", [normalized]);
  if (!g) return fail("no group with that code", 404);
  await q("insert into memberships(group_id,user_id) values($1,$2) on conflict do nothing", [g.id, uid]);
  return json({ id: g.id });
}
