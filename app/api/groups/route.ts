import { z } from "zod";
import { q, q1 } from "@/lib/db";
import { fail, json, requireUser } from "@/lib/api";

// TODO(decision): no geocoder wired up; known cities resolve, anything else falls back to Austin.
const CITIES: Record<string, [number, number]> = { austin: [30.2672, -97.7431], dallas: [32.7767, -96.797], houston: [29.7604, -95.3698], "san antonio": [29.4241, -98.4936], "new york": [40.7128, -74.006] };
const code = () => Math.random().toString(36).slice(2, 8).toUpperCase();

export async function GET() {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const rows = await q<any>(
    `select g.id, g.name, g.city,
       (select count(*)::int from memberships where group_id=g.id) members,
       (select status from plan_rounds where group_id=g.id order by id desc limit 1) round_status,
       (select count(*)::int from memberships m where m.group_id=g.id and jsonb_array_length(m.availability)=0) unset
     from groups g join memberships mm on mm.group_id=g.id where mm.user_id=$1 order by g.id desc`, [uid]);
  return json(rows.map((r) => ({ ...r, status: r.round_status === "voting" ? "VOTING OPEN" : r.round_status === "final" ? "FINAL" : "SET UP" })));
}

const Body = z.object({ name: z.string().min(1), city: z.string().min(1) });
export async function POST(req: Request) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("name and city required");
  const key = p.data.city.toLowerCase().split(",")[0].trim();
  const [lat, lng] = CITIES[key] ?? CITIES.austin;
  const g = await q1<{ id: number }>("insert into groups(name,city,lat,lng,invite_code,created_by) values($1,$2,$3,$4,$5,$6) returning id", [p.data.name, p.data.city, lat, lng, code(), uid]);
  await q("insert into memberships(group_id,user_id) values($1,$2)", [g!.id, uid]);
  return json({ id: g!.id });
}
