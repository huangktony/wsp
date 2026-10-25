// Nessie client. Behavior verified against the live sandbox, see scripts/nessie-probe.ts.
import { mockPurchases } from "./mocks/data";
import type { MerchantInfo, NessiePurchase } from "./analyze";
import { planPurchases, startingBalance, type Spender } from "./profiles";
import { HANGOUT_CATEGORY, HANGOUT_MERCHANT, hangoutDescription, hasHangout } from "./hangout";
import { pendingHalves, splitDescription, type LedgerEntry } from "./ledger";

const BASE = "https://api.nessieisreal.com";
const useMock = () => process.env.USE_MOCKS === "true" || !process.env.NESSIE_API_KEY;
const url = (p: string) => `${BASE}${p}${p.includes("?") ? "&" : "?"}key=${process.env.NESSIE_API_KEY}`;

/** Live mode: key set and mocks not forced. In live mode nothing falls back to mock data. */
const live = () => !useMock();

/** True when this account's hangouts and paybacks are recorded in Nessie. Otherwise they only exist in our database. */
export const isLiveAccount = (accountId: string | null) => live() && !!accountId && !accountId.startsWith("mock-");

/** Never let the API key reach a log line or an error message. */
export function maskKey(s: string): string {
  const k = process.env.NESSIE_API_KEY;
  return k ? s.split(k).join("***") : s;
}

async function nj(path: string, init?: RequestInit) {
  const method = init?.method ?? "GET";
  let res: Response;
  try {
    res = await fetch(url(path), { ...init, headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(10000) });
  } catch (e: any) {
    throw new Error(maskKey(`nessie ${method} ${path} failed: ${e?.cause?.code ?? e?.message ?? e}`));
  }
  if (!res.ok) throw new Error(maskKey(`nessie ${method} ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`));
  return res.json();
}

// ---- Live seeding -------------------------------------------------------------------------------------------
// The sandbox starts empty, so linking creates a spending history. Verified Nessie behavior (see nessie-probe.ts):
// merchant category is a string, purchase amounts are stored as whole dollars, past dates are kept.

type Cat = "food" | "entertainment" | "groceries" | "transport" | "shopping";
// Names must not start with "WSP Probe" (reserved for the probe script).
export const SEED_MERCHANTS: { name: string; category: Cat; street: string }[] = [
  { name: "Torchy's Tacos", category: "food", street: "Guadalupe St" },
  { name: "Franklin Barbecue", category: "food", street: "E 11th St" },
  { name: "Jeni's Ice Cream", category: "food", street: "S Lamar Blvd" },
  { name: "Alamo Drafthouse", category: "entertainment", street: "E 6th St" },
  { name: "Barton Springs Mini Golf", category: "entertainment", street: "Barton Springs Rd" },
  { name: "Emo's Austin", category: "entertainment", street: "E Riverside Dr" },
  { name: "H-E-B", category: "groceries", street: "E 41st St" },
  { name: "Uber", category: "transport", street: "Congress Ave" },
  { name: "Target", category: "shopping", street: "Lamar Blvd" },
  { name: "BookPeople", category: "shopping", street: "N Lamar Blvd" },
];

/** Finds seed merchants by name and creates only the missing ones. Tolerates duplicate names (first wins, never creates another). */
export async function ensureMerchants(): Promise<Map<string, { id: string; category: Cat }>> {
  const existing: any[] = await nj("/merchants");
  const byName = new Map<string, string>();
  for (const m of existing) if (!byName.has(m.name)) byName.set(m.name, m._id);
  const out = new Map<string, { id: string; category: Cat }>();
  for (const m of SEED_MERCHANTS) {
    let id = byName.get(m.name);
    if (!id) {
      const c = await nj("/merchants", {
        method: "POST",
        body: JSON.stringify({ name: m.name, category: m.category, address: { street_number: "100", street_name: m.street, city: "Austin", state: "TX", zip: "78701" }, geocode: { lat: 30.2672, lng: -97.7431 } }),
      });
      id = c.objectCreated?._id as string;
      if (!id) throw new Error(`nessie did not return an id for merchant ${m.name}`);
      byName.set(m.name, id);
    }
    out.set(m.name, { id, category: m.category });
  }
  return out;
}

/** Posts the planned purchases (see planPurchases). Does nothing if the account already has purchases. */
export async function seedAccount(accountId: string, userId: number, profile: Spender): Promise<number> {
  const existing: any[] = await nj(`/accounts/${accountId}/purchases`);
  if (existing.length) return 0;
  const merchants = await ensureMerchants();
  const rows = planPurchases(userId, profile).map((p) => {
    const m = merchants.get(p.merchant);
    if (!m) throw new Error(`seed merchant missing: ${p.merchant}`);
    const purchase_date = new Date(Date.now() - p.daysAgo * 864e5).toISOString().slice(0, 10);
    return { merchant_id: m.id, amount: p.amount, status: p.status, description: p.merchant, purchase_date };
  });
  for (let i = 0; i < rows.length; i += 5) {
    await Promise.all(rows.slice(i, i + 5).map((row) => nj(`/accounts/${accountId}/purchases`, { method: "POST", body: JSON.stringify({ medium: "balance", ...row }) })));
  }
  return rows.length;
}

/** Finds a merchant by name (first match wins, duplicates tolerated) or creates it. */
async function ensureMerchant(name: string, category: string): Promise<string> {
  const existing: any[] = await nj("/merchants");
  const hit = existing.find((m) => m.name === name);
  if (hit) return hit._id;
  const c = await nj("/merchants", {
    method: "POST",
    body: JSON.stringify({ name, category, address: { street_number: "1", street_name: "Congress Ave", city: "Austin", state: "TX", zip: "78701" }, geocode: { lat: 30.2672, lng: -97.7431 } }),
  });
  const id = c.objectCreated?._id as string;
  if (!id) throw new Error(`nessie did not return an id for merchant ${name}`);
  return id;
}

/**
 * Records what the payer paid up front: ONE purchase for the whole bill at the "WSP Hangout" merchant, once per round.
 * Live mode throws on failure so the caller can refuse and retry. Mock mode and mock- accounts do nothing.
 * Nessie stores whole dollars, and the bill is a sum of whole-dollar stop costs, so nothing is truncated.
 */
export async function recordHangout(accountId: string | null, roundId: number, title: string, total: number): Promise<boolean> {
  if (!live() || !accountId || accountId.startsWith("mock-") || total <= 0) return false;
  const existing: any[] = await nj(`/accounts/${accountId}/purchases`);
  if (hasHangout(existing, roundId)) return false;
  const merchant_id = await ensureMerchant(HANGOUT_MERCHANT, HANGOUT_CATEGORY);
  await nj(`/accounts/${accountId}/purchases`, {
    method: "POST",
    body: JSON.stringify({ merchant_id, medium: "balance", purchase_date: new Date().toISOString().slice(0, 10), amount: Math.round(total), status: "completed", description: hangoutDescription(title, roundId) }),
  });
  return true;
}

/** Nessie answers 404 "No ... found for this account" for an empty transfers/deposits/withdrawals list. That means zero, not an error. */
async function njList(path: string): Promise<any[]> {
  try {
    return await nj(path);
  } catch (e: any) {
    if (/ 404:/.test(String(e?.message))) return [];
    throw e;
  }
}

/** Creates a Nessie customer + checking account and seeds its purchase history, or returns a mock id pair. */
export async function linkAccount(name: string, userId: number, profile: Spender): Promise<{ customerId: string; accountId: string }> {
  if (live()) {
    const [first, ...rest] = name.split(" ");
    const c = await nj("/customers", {
      method: "POST",
      body: JSON.stringify({ first_name: first, last_name: rest.join(" ") || "Demo", address: { street_number: "1", street_name: "Main St", city: "Austin", state: "TX", zip: "78701" } }),
    });
    const customerId = c.objectCreated?._id;
    const a = await nj(`/customers/${customerId}/accounts`, {
      method: "POST",
      body: JSON.stringify({ type: "Checking", nickname: "WSP demo", rewards: 0, balance: startingBalance(profile, userId) }),
    });
    const accountId = a.objectCreated?._id;
    if (!customerId || !accountId) throw new Error("nessie did not return customer and account ids");
    await seedAccount(accountId, userId, profile);
    return { customerId, accountId };
  }
  const id = `mock-${Math.random().toString(36).slice(2, 10)}`;
  return { customerId: `c-${id}`, accountId: id };
}

/** Merchants never change, so cache them for the life of the server process, keyed by merchant id. */
const merchantCache = new Map<string, MerchantInfo>();

/** `balance` is the account's STARTING balance: Nessie does not deduct purchases from it. */
export type SpendingData = { purchases: NessiePurchase[]; merchants: Map<string, MerchantInfo>; balance: number | null; ledger: LedgerEntry[] };

const MOCK_BALANCE = 2000;

/**
 * Everything one request needs, fetched once: the account check, all purchases, and the merchants they reference.
 * Callers derive every number from this with analyze(), so the tier and the screen cannot disagree.
 */
export async function loadSpending(accountId: string | null): Promise<SpendingData> {
  if (live() && accountId && !accountId.startsWith("mock-")) {
    // Live: zero purchases means zero, and errors surface to the caller.
    // Nessie answers 200 [] for purchases of an unknown account or wrong key, but 404 for the account itself,
    // so check the account first. Otherwise a wrong account would look like someone who spent nothing.
    const account = await nj(`/accounts/${accountId}`);
    const [rows, withdrawals, deposits] = await Promise.all([
      nj(`/accounts/${accountId}/purchases`) as Promise<any[]>,
      njList(`/accounts/${accountId}/withdrawals`),
      njList(`/accounts/${accountId}/deposits`),
    ]);
    const entry = (kind: "in" | "out") => (r: any): LedgerEntry => ({ kind, date: r.transaction_date, amount: r.amount, description: r.description });
    const ledger = [...withdrawals.filter((r) => r.status !== "cancelled").map(entry("out")), ...deposits.filter((r) => r.status !== "cancelled").map(entry("in"))];
    const purchases: NessiePurchase[] = rows.map((r) => ({ merchant_id: r.merchant_id, purchase_date: r.purchase_date, amount: r.amount, status: r.status }));
    const merchants = new Map<string, MerchantInfo>();
    const missing: string[] = [];
    for (const id of new Set(purchases.map((p) => p.merchant_id))) {
      const hit = merchantCache.get(id);
      if (hit) merchants.set(id, hit);
      else missing.push(id);
    }
    // A merchant we cannot fetch is left out, so analyze() shows it as "Unknown merchant" in "other". Failures are not cached.
    await Promise.all(missing.map(async (id) => {
      try {
        const m = await nj(`/merchants/${id}`);
        const info: MerchantInfo = { name: m.name, category: m.category };
        merchantCache.set(id, info);
        merchants.set(id, info);
      } catch (e: any) {
        console.error(maskKey(`merchant lookup failed: ${e?.message ?? e}`));
      }
    }));
    return { purchases, merchants, balance: typeof account.balance === "number" ? account.balance : null, ledger };
  }
  // Mock mode and mock- accounts: same shape, built from the mock generator (90 days covers every range the screen offers).
  const merchants = new Map<string, MerchantInfo>();
  const purchases = mockPurchases(accountId ?? "demo", 90).map((p) => {
    const id = `mock:${p.merchant}`;
    merchants.set(id, { name: p.merchant, category: p.category });
    return { merchant_id: id, purchase_date: p.date, amount: p.amount, status: "completed" };
  });
  return { purchases, merchants, balance: MOCK_BALANCE, ledger: [] };
}

/**
 * Records a repayment as TWO ledger rows, because a Nessie transfer cannot link two accounts and truncates cents:
 * a withdrawal on the person who paid back, and a deposit on the person who was paid back. Exact cents ride in the description.
 * Idempotent per payment: a row that already exists for this payment is not posted again, so a retry posts only the missing half.
 * Live mode throws on any failure so the caller can undo "paid". Mock mode and mock- accounts do nothing.
 * Nothing here moves a balance (Nessie never does); it is a record.
 */
export async function recordPayback(p: { payId: number; fromAccount: string | null; toAccount: string | null; amount: number; label: string }): Promise<void> {
  const { payId, fromAccount, toAccount, amount, label } = p;
  if (!live() || !fromAccount || !toAccount || fromAccount.startsWith("mock-") || toAccount.startsWith("mock-")) return;
  const [withdrawals, deposits] = await Promise.all([njList(`/accounts/${fromAccount}/withdrawals`), njList(`/accounts/${toAccount}/deposits`)]);
  const { needWithdrawal, needDeposit } = pendingHalves(withdrawals, deposits, payId);
  const cents = Math.round(amount * 100);
  const whole = Math.max(1, Math.round(amount)); // Nessie keeps whole dollars; the exact amount is in the description
  const common = { medium: "balance", transaction_date: new Date().toISOString().slice(0, 10), status: "completed", amount: whole };
  if (needWithdrawal) {
    await nj(`/accounts/${fromAccount}/withdrawals`, { method: "POST", body: JSON.stringify({ ...common, description: splitDescription({ payId, counterpart: toAccount, cents, label }) }) });
  }
  if (needDeposit) {
    await nj(`/accounts/${toAccount}/deposits`, { method: "POST", body: JSON.stringify({ ...common, description: splitDescription({ payId, counterpart: fromAccount, cents, label }) }) });
  }
}

/** A failure whose message is safe to show the member (missing account, insufficient funds). */
export class PaymentError extends Error {}

const transferDescription = (group: string, payId: number, amount: number) => `SideQuest: ${group.replace(/\s+/g, " ").trim().slice(0, 40)} (pay ${payId}, $${amount.toFixed(2)})`;
const transferPayId = (description?: string) => Number(/\(pay (\d+),/.exec(description ?? "")?.[1]) || null;

/**
 * Pays one debt: a transfer on the member's account, plus the withdrawal and deposit that put it on both ledgers (recordPayback).
 * The sandbox cannot name a payee on a transfer, so the transfer is the member's one-sided record and the two ledger rows are what the
 * payer sees as money received. Idempotent per payment: an existing transfer for this payment is reused, so a retry after a partial
 * failure never sends a second one. Throws PaymentError for problems the member can act on, anything else for outages.
 * Without a live Nessie account on both sides the payment is recorded only in our database (id "local-<payId>").
 */
export async function sendPayment(p: { payId: number; fromAccount: string | null; toAccount: string | null; amount: number; groupName: string }): Promise<{ transferId: string; status: string }> {
  const { payId, fromAccount, toAccount, amount, groupName } = p;
  if (live() && (!fromAccount || !toAccount)) throw new PaymentError(!fromAccount ? "Link your bank account before paying." : "The organizer hasn't linked a bank account yet.");
  if (!isLiveAccount(fromAccount) || !isLiveAccount(toAccount)) return { transferId: `local-${payId}`, status: "completed" };
  const account = await nj(`/accounts/${fromAccount}`);
  if (typeof account.balance === "number" && account.balance < amount) throw new PaymentError(`Insufficient funds: your account has $${account.balance.toFixed(2)}.`);
  const existing = (await njList(`/accounts/${fromAccount}/transfers`)).find((t) => transferPayId(t.description) === payId);
  let transferId: string = existing?._id, status: string = existing?.status;
  if (!transferId) {
    // Verified body (nessie-probe.ts): exactly these four fields. Nessie truncates the amount, so the exact cents ride in the description.
    const c = await nj(`/accounts/${fromAccount}/transfers`, {
      method: "POST",
      body: JSON.stringify({ transaction_date: new Date().toISOString().slice(0, 10), status: "completed", amount: Math.max(1, Math.round(amount)), description: transferDescription(groupName, payId, amount) }),
    });
    transferId = c.objectCreated?._id;
    status = c.objectCreated?.status ?? "completed";
    if (!transferId) throw new Error("nessie did not return a transfer id");
  }
  await recordPayback({ payId, fromAccount, toAccount, amount, label: `${groupName} hangout` });
  return { transferId, status: status ?? "completed" };
}

/** Where Nessie says a transfer stands ("pending", "completed", ...), or null if it can't be found. */
export async function transferStatus(accountId: string, transferId: string): Promise<string | null> {
  if (!isLiveAccount(accountId)) return null;
  const hit = (await njList(`/accounts/${accountId}/transfers`)).find((t) => t._id === transferId);
  return hit?.status ?? null;
}
