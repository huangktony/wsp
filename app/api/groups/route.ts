import { settleRound } from "@/lib/pipeline";
import { includedVoteSql } from "@/lib/roundParticipation";
import { z } from "zod";
import { pool, q } from "@/lib/db";
import { fail, json, requireUser } from "@/lib/api";
import { generateInviteCode } from "@/lib/inviteCode";
import { geocodeCity } from "@/lib/serpapi";
import { normalizeUSCity, US_CITY_ERROR } from "@/lib/usCities";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;

  // Settle the authoritative round before deriving labels and CTAs.
  const rounds = await q<{ id: number; group_id: number }>(
    `select r.id, g.id group_id
     from groups g
     join memberships m on m.group_id=g.id
     join lateral (
       select id,status from plan_rounds
       where group_id=g.id
       order by (status='final') desc,id desc limit 1
     ) r on true
     where m.user_id=$1 and r.status='voting'`,
    [uid],
  );
  await Promise.all(rounds.map(async (r) => {
    try {
      await settleRound(r.id);
    } catch (error) {
      console.error(`Failed to settle round ${r.id} for group ${r.group_id}`, error);
    }
  }));

  const rows = await q<any>(
    `select g.id, g.name, g.city,
       (select count(*)::int from memberships where group_id=g.id) members,
       r.status round_status,
       r.created_at round_started_at,
       exists(select 1 from plans p where p.round_id=r.id) has_plans,
       greatest(g.created_at, r.created_at,
         (select max(joined_at) from memberships where group_id=g.id)) last_activity_at,
       (jsonb_array_length(mm.availability)>0 and ${includedVoteSql("r", "mm.user_id")}) can_vote,
       exists (
         select 1 from votes v join plans p on p.id=v.plan_id
         where p.round_id=r.id and v.user_id=$1
       ) my_voted,
       (select count(*)::int from memberships m
         where m.group_id=g.id and jsonb_array_length(m.availability)=0) unset
     from groups g
     join memberships mm on mm.group_id=g.id
     left join lateral (
       select * from plan_rounds
       where group_id=g.id
       order by (status='final') desc,id desc limit 1
     ) r on true
     where mm.user_id=$1
     order by last_activity_at desc, g.id desc`,
    [uid],
  );

  return json(
    rows.map((r) => ({
      ...r,
      status:
        r.round_status === "voting" && r.has_plans
          ? "VOTING OPEN"
          : r.round_status === "final"
            ? "FINAL"
            : "SET UP",
    })),
  );
}

const Body = z.object({ name: z.string().trim().min(1), city: z.string() });
export async function POST(req: Request) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const body = await req.json().catch(() => null);
  const p = Body.safeParse(body);
  if (!p.success) return fail("name and city required");
  const city = normalizeUSCity(p.data.city);
  if (!city) return fail(US_CITY_ERROR);
  let location;
  try {
    location = await geocodeCity(`${city}, United States`);
  } catch {
    return fail("We couldn't find that city. Check the spelling or try again.", 422);
  }
  // Geocode before opening the transaction; no rows are created on provider failure.
  let client;
  try {
    client = await pool.connect();
    await client.query("begin");
    let g: { id: number; invite_code: string };
    for (let attempt = 0; ; attempt++) {
      const inviteCode = generateInviteCode(attempt < 10 ? 3 : 4);
      const result = await client.query<{ id: number; invite_code: string }>(
        "insert into groups(name,city,lat,lng,invite_code,created_by) values($1,$2,$3,$4,$5,$6) on conflict (invite_code) do nothing returning id,invite_code",
        [p.data.name, city, location.latitude, location.longitude, inviteCode, uid]);
      if (result.rows[0]) { g = result.rows[0]; break; }
    }
    await client.query("insert into memberships(group_id,user_id) values($1,$2)", [g.id, uid]);
    await client.query("commit");
    return json({ id: g.id, inviteCode: g.invite_code });
  } catch {
    if (client) await client.query("rollback").catch(() => {});
    return fail("We couldn't create your group. Try again.", 500);
  } finally {
    client?.release();
  }
}
