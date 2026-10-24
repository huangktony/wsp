import { q1 } from "@/lib/db";
import { json, requireUser } from "@/lib/api";
import { getPurchases, getSeries } from "@/lib/nessie";
import { TIER_CUTOFFS, computeTier } from "@/lib/tier";

// Owner only: this is the one place raw spending is exposed, and only for the signed-in user.
export async function GET(req: Request) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const days = Math.min(90, Math.max(7, Number(new URL(req.url).searchParams.get("days")) || 30));
  const u = await q1<any>("select nessie_account_id from users where id=$1", [uid]);
  if (!u.nessie_account_id) {
    return json({ linked: false, tier: null, avgOuting: null, categories: [], recent: [], balance: [], debt: [] });
  }
  // Recompute so the tier shown here always matches what groups use.
  const { tier, avg } = await computeTier(uid, u.nessie_account_id);
  const purchases = await getPurchases(u.nessie_account_id, days);
  const cats = new Map<string, number>();
  for (const p of purchases) cats.set(p.category, (cats.get(p.category) ?? 0) + p.amount);
  const series = await getSeries(u.nessie_account_id, days);
  return json({
    tier, avgOuting: Math.round(avg * 100) / 100, cutoffs: TIER_CUTOFFS, linked: true,
    categories: [...cats.entries()].map(([name, total]) => ({ name, total: Math.round(total) })).sort((a, b) => b.total - a.total),
    recent: purchases.slice(-5).reverse(),
    ...series,
  });
}
