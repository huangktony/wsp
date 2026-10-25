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
  const rounds = await q<{ id: number }>(
    `select r.id
     from groups g
     join memberships m on m.group_id=g.id
     join lateral (
       select id,status from plan_rounds
       where group_id=g.id and status<>'failed'
       order by (status='final') desc,id desc limit 1
     ) r on true
     where m.user_id=$1 and r.status='voting'`,
    [uid],
  );
  await Promise.all(rounds.map((r) => settleRound(r.id)));

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
       where group_id=g.id and status<>'failed'
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