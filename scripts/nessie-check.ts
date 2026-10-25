// Usage: npm run nessie:check <email or Nessie account id>
// Prints the raw Nessie purchases next to analyze() output so the totals can be checked by hand. Read-only.
// Runs in live mode (USE_MOCKS=false is set by the npm script). Never prints the API key.
import { pool, q1 } from "../lib/db";
import { loadSpending } from "../lib/nessie";
import { analyze } from "../lib/analyze";

async function main() {
  const arg = process.argv[2];
  if (!arg) throw new Error("usage: npm run nessie:check <email or account id>");
  let accountId = arg;
  let stored: { budget_tier: string | null; avg_outing_cost: string | null } | null = null;
  if (arg.includes("@")) {
    const u = await q1<any>("select nessie_account_id, budget_tier, avg_outing_cost from users where email=$1", [arg.toLowerCase()]);
    if (!u?.nessie_account_id) throw new Error(`no linked account for ${arg}`);
    accountId = u.nessie_account_id;
    stored = u;
  }
  const now = new Date();
  const data = await loadSpending(accountId);
  console.log(`account ${accountId}  (${data.purchases.length} purchases, ${data.merchants.size} merchants, as of ${now.toISOString().slice(0, 10)})\n`);

  const rows = data.purchases
    .map((p) => ({ date: p.purchase_date, merchant: data.merchants.get(p.merchant_id)?.name ?? "Unknown merchant", category: data.merchants.get(p.merchant_id)?.category ?? "?", status: p.status, amount: p.amount }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  console.table(rows);

  // Hand sums straight from the raw rows (cancelled dropped, 30 calendar days), independent of analyze().
  const first = new Date(now.getTime() - 29 * 864e5).toISOString().slice(0, 10);
  const live = rows.filter((r) => r.status !== "cancelled" && r.date >= first);
  const by: Record<string, number> = {};
  for (const r of live) by[r.category] = (by[r.category] ?? 0) + r.amount;
  const fun = live.filter((r) => r.category === "food" || r.category === "entertainment");
  console.log("hand sums, 30d:", JSON.stringify(by), "| spent", live.reduce((s, r) => s + r.amount, 0), "| fun n =", fun.length, "avg", (fun.reduce((s, r) => s + r.amount, 0) / (fun.length || 1)).toFixed(2));

  const a = analyze(data.purchases, data.merchants, 30, now);
  console.log("\nanalyze() 30d:");
  console.log("  categories:", JSON.stringify(a.categories.map((c) => `${c.name} ${c.total}`)));
  console.log(`  spent ${a.spent} | count ${a.count} | avgFun ${a.avgFun} | usedDefault ${a.usedDefault} | tier ${a.tier}`);
  console.log("  recent:", JSON.stringify(a.recent.map((r) => `${r.date} ${r.merchant} ${r.amount}`)));
  if (stored) console.log(`\nstored in database: budget_tier ${stored.budget_tier}, avg_outing_cost ${stored.avg_outing_cost}`);
  await pool.end();
}
main().catch((e) => { console.error("check failed:", e.message ?? e); process.exit(1); });
