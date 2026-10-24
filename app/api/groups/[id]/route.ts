import { q, q1 } from "@/lib/db";
import { fail, isMember, json, requireUser } from "@/lib/api";
import { groupTier } from "@/lib/tier";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const id = Number((await params).id);
  if (!(await isMember(id, uid))) return fail("not in this group", 403);
  const g = await q1<any>("select id,name,city,invite_code,created_by from groups where id=$1", [id]);
  // Members: name and whether setup is done. Never tier, interests or spending.
  const members = await q<any>("select u.id,u.name,(jsonb_array_length(m.availability)>0) setup_done from memberships m join users u on u.id=m.user_id where m.group_id=$1 order by m.joined_at", [id]);
  const round = await q1<any>("select id,status from plan_rounds where group_id=$1 order by id desc limit 1", [id]);
  return json({ ...g, members, groupTier: await groupTier(id), round, isCreator: g.created_by === uid, me: uid });
}
