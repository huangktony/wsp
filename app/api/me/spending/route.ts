import { q, q1 } from "@/lib/db";
import { fail, json, requireUser } from "@/lib/api";
import { isLiveAccount, loadSpending, maskKey } from "@/lib/nessie";
import { withLocalRecords } from "@/lib/localLedger";
import { analyze } from "@/lib/analyze";
import { splitAccounts } from "@/lib/ledger";
import { budgetSummary, sumOwed } from "@/lib/budget";
import { TIER_CUTOFFS, computeTier } from "@/lib/tier";

// Owner only: this is the one place raw spending is exposed, and only for the signed-in user.
export async function GET() {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const DAYS = 30; // fixed window: the screen has no range switcher
  const u = await q1<any>("select nessie_account_id from users where id=$1", [uid]);
  if (!u.nessie_account_id) {
    return json({ linked: false, tier: null, avgOuting: null, categories: [], transactions: [] });
  }
  try {
    // One load per request. The tier (always 30 days, same as groups use) and the N-day view both come from it.
    const now = new Date();
    const loaded = await loadSpending(u.nessie_account_id);
    const data = isLiveAccount(u.nessie_account_id) ? loaded : await withLocalRecords(loaded, uid);
    const { tier, avg, usedDefault } = await computeTier(uid, u.nessie_account_id, data);
    // Names for the people on the other side of a payback, ONLY for users who share a group with the viewer. Anyone else is "a friend".
    const accts = splitAccounts(data.ledger);
    const names = new Map<string, string>();
    if (accts.length) {
      const rows = await q<{ nessie_account_id: string; name: string }>(
        `select u.nessie_account_id, u.name from users u
         where u.nessie_account_id = any($1) and u.id <> $2
           and exists (select 1 from memberships a join memberships b on a.group_id = b.group_id where a.user_id = $2 and b.user_id = u.id)`, [accts, uid]);
      for (const r of rows) names.set(r.nessie_account_id, r.name);
    }
    const view = analyze(data.purchases, data.merchants, DAYS, now, data.ledger, names);
    // Balance, owe and net. Nessie never moves a balance and has no debt source, so the balance is the starting balance
    // adjusted by the same transactions as the list below, and "you owe" is the payments this user still has marked 'owed'.
    const owe = sumOwed(await q<{ amount: number; status: string }>("select amount::float amount, status from payments where user_id=$1", [uid]));
    const money = data.balance == null ? null : budgetSummary({ startingBalance: data.balance, transactions: view.transactions, owe, days: DAYS, now });
    return json({
      tier, avgOuting: avg, usedDefault, cutoffs: TIER_CUTOFFS, linked: true, days: DAYS, today: now.toISOString().slice(0, 10),
      startingBalance: data.balance, balance: money?.balance ?? null, owe, net: money?.net ?? null, change: money?.change ?? null, series: money?.series ?? [],
      spent: view.spent, count: view.count, paidBackToYou: view.paidBackToYou, categories: view.categories, transactions: view.transactions.slice(0, 10),
    });
  } catch (e: any) {
    console.error(maskKey(`spending failed: ${e?.message ?? e}`));
    return fail("Could not reach the bank service", 502);
  }
}
