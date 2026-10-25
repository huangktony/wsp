import { q1 } from "@/lib/db";
import { fail, json, requireUser } from "@/lib/api";
import { loadSpending, maskKey } from "@/lib/nessie";
import { analyze } from "@/lib/analyze";
import { TIER_CUTOFFS, computeTier } from "@/lib/tier";

// Owner only: this is the one place raw spending is exposed, and only for the signed-in user.
export async function GET(req: Request) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const days = Math.min(90, Math.max(7, Number(new URL(req.url).searchParams.get("days")) || 30));
  const u = await q1<any>("select nessie_account_id from users where id=$1", [uid]);
  if (!u.nessie_account_id) {
    return json({ linked: false, tier: null, avgOuting: null, categories: [], recent: [] });
  }
  try {
    // One load per request. The tier (always 30 days, same as groups use) and the N-day view both come from it.
    const data = await loadSpending(u.nessie_account_id);
    const { tier, avg, usedDefault } = await computeTier(uid, u.nessie_account_id, data);
    const view = analyze(data.purchases, data.merchants, days, new Date());
    return json({
      tier, avgOuting: avg, usedDefault, cutoffs: TIER_CUTOFFS, linked: true, days,
      startingBalance: data.balance, spent: view.spent, count: view.count, categories: view.categories, recent: view.recent,
    });
  } catch (e: any) {
    console.error(maskKey(`spending failed: ${e?.message ?? e}`));
    return fail("Could not reach the bank service", 502);
  }
}
