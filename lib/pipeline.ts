import { q, q1 } from "./db";
import { groupTier } from "./tier";
import { categoriesFor, findPlaces } from "./serpapi";
import { generatePlans } from "./gemini";

/** Availability is a list of slot strings like "Fri evening". Pick the slot shared by most members. */
export function bestSlot(avails: string[][]): string {
  const count = new Map<string, number>();
  for (const a of avails) for (const s of a) count.set(s, (count.get(s) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Saturday evening";
}

export async function runFindPlans(groupId: number): Promise<number> {
  const group = await q1<any>("select * from groups where id=$1", [groupId]);
  const members = await q<any>("select m.availability, u.interests from memberships m join users u on u.id=m.user_id where m.group_id=$1", [groupId]);
  const slot = bestSlot(members.map((m) => m.availability as string[]));
  const tier = await groupTier(groupId);
  const sets = members.map((m) => m.interests as string[]);
  const shared = sets.length ? sets[0].filter((i) => sets.every((s) => s.includes(i))) : [];
  const interests = shared.length ? shared : [...new Set(sets.flat())];
  const places = await findPlaces(categoriesFor(interests), group.lat, group.lng, tier);
  const drafts = await generatePlans({ city: group.city, slot, tier, interests, places });

  const round = await q1<{ id: number }>("insert into plan_rounds(group_id,status,group_tier) values($1,'voting',$2) returning id", [groupId, tier]);
  for (const d of drafts) {
    const price = d.est_cost_per_person <= 20 ? "$" : d.est_cost_per_person <= 40 ? "$$" : "$$$";
    await q("insert into plans(round_id,title,summary,stops,est_cost_per_person,price_level,why_fits) values($1,$2,$3,$4,$5,$6,$7)",
      [round!.id, d.title, d.summary, JSON.stringify(d.stops), d.est_cost_per_person, price, d.why_fits]);
  }
  return round!.id;
}

/** Majority approve wins; ties go to lower cost. */
export async function pickWinner(roundId: number): Promise<number> {
  const rows = await q<any>(
    `select p.id, p.est_cost_per_person::float cost, count(v.*) filter (where v.value='approve') approves
     from plans p left join votes v on v.plan_id=p.id where p.round_id=$1 group by p.id order by approves desc, cost asc, p.id asc`, [roundId]);
  return rows[0].id;
}
