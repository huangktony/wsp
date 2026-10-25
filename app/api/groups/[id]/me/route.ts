import { normalizeAvailability } from "@/lib/availability";
import { q, q1 } from "@/lib/db";
import { fail, isMember, json, requireUser } from "@/lib/api";
import { MeBody } from "@/lib/comfort";

/**
 * Your own setup for this group. `suggested` is the level from your spending, `comfort_tier` is the level you picked for this
 * group (null = use the suggestion). Only YOU get these; other members only ever see the group's lowest level.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const id = Number((await params).id);
  const m = await q1<any>(
    `select m.availability, m.comfort_tier, to_jsonb(m)->'preferences' preferences, u.interests, u.max_distance_mi, u.budget_tier suggested, u.avg_outing_cost::float avg_outing_cost
     from memberships m join users u on u.id=m.user_id where m.group_id=$1 and m.user_id=$2`, [id, uid]);
  return m ? json({ ...m, availability: normalizeAvailability(m.availability), availability_expired: !!m.availability?.length && !normalizeAvailability(m.availability).length }) : fail("not in this group", 403);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const id = Number((await params).id);
  if (!(await isMember(id, uid))) return fail("not in this group", 403);
  const p = MeBody.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("bad input");
  await q("update memberships set availability=$1 where group_id=$2 and user_id=$3", [JSON.stringify(p.data.availability), id, uid]);
  // Absent leaves the pick alone; null clears it (back to the suggestion).
  if (p.data.comfort_tier !== undefined) await q("update memberships set comfort_tier=$1 where group_id=$2 and user_id=$3", [p.data.comfort_tier, id, uid]);
  await q("update users set interests=$1, max_distance_mi=$2 where id=$3", [p.data.interests.filter(i => !p.data.preferences?.avoids.some(avoid => avoid === i)), p.data.max_distance_mi, uid]);
  let preferencesSaved = p.data.preferences === undefined;
  if (p.data.preferences !== undefined) {
    const schema = await q1<{ ready: boolean }>("select exists(select 1 from information_schema.columns where table_schema=current_schema() and table_name='memberships' and column_name='preferences') ready");
    if (schema?.ready) {
      await q("update memberships set preferences=coalesce(preferences,'{}'::jsonb) || $1::jsonb where group_id=$2 and user_id=$3", [JSON.stringify(p.data.preferences), id, uid]);
      preferencesSaved = true;
    }
  }
  return json({ ok: true, preferencesSaved });
}
