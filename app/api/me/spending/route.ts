import { q1 } from "@/lib/db";
import { json, requireUser } from "@/lib/api";
import { getPurchases, getSeries } from "@/lib/nessie";

// Owner only: this is the one place raw spending is exposed, and only for the signed-in user.
export async function GET(req: Request) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const days = Math.min(90, Math.max(7, Number(new URL(req.url).searchParams.get("days")) || 30));
  const u = await q1<any>("select nessie_account_id, budget_tier, avg_outing_cost::float avg from users where id=$1", [uid]);
  const purchases = await getPurchases(u.nessie_account_id, days);
  const cats = new Map<string, number>();
  for (const p of purchases) cats.set(p.category, (cats.get(p.category) ?? 0) + p.amount);
  const series = await getSeries(u.nessie_account_id, days);
  return json({
    tier: u.budget_tier, avgOuting: u.avg, linked: !!u.nessie_account_id,
    categories: [...cats.entries()].map(([name, total]) => ({ name, total: Math.round(total) })).sort((a, b) => b.total - a.total),
    recent: purchases.slice(-5).reverse(),
    ...series,
  });
}
