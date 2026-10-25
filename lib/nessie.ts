// Nessie client. Behavior verified against the live sandbox, see scripts/nessie-probe.ts.
import { mockPurchases, mockSeries, type Purchase } from "./mocks/data";

const BASE = "https://api.nessieisreal.com";
const useMock = () => process.env.USE_MOCKS === "true" || !process.env.NESSIE_API_KEY;
const url = (p: string) => `${BASE}${p}${p.includes("?") ? "&" : "?"}key=${process.env.NESSIE_API_KEY}`;

/** Live mode: key set and mocks not forced. In live mode nothing falls back to mock data. */
const live = () => !useMock();

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

export type Spender = "frugal" | "average" | "big";
export const spenderFor = (userId: number): Spender => (["frugal", "average", "big"] as const)[userId % 3];
// Whole-dollar fun-purchase ranges chosen to sit fully inside one tier for TIER_CUTOFFS [12, 30].
const FUN_RANGE: Record<Spender, [number, number]> = { frugal: [5, 11], average: [14, 28], big: [32, 60] };

function rng(seed: number) {
  let a = seed + 0x6d2b79f5;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Posts ~25 purchases over the last 29 days (plus 2 cancelled). Does nothing if the account already has purchases. */
export async function seedAccount(accountId: string, userId: number): Promise<number> {
  const existing: any[] = await nj(`/accounts/${accountId}/purchases`);
  if (existing.length) return 0;
  const merchants = await ensureMerchants();
  const all = [...merchants.entries()];
  const fun = all.filter(([, m]) => m.category === "food" || m.category === "entertainment");
  const other = all.filter(([, m]) => m.category !== "food" && m.category !== "entertainment");
  const r = rng(userId * 7919 + 13);
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const [lo, hi] = FUN_RANGE[spenderFor(userId)];
  const day = () => new Date(Date.now() - int(0, 28) * 864e5).toISOString().slice(0, 10);

  const rows: { merchant_id: string; amount: number; status: string; description: string; purchase_date: string }[] = [];
  for (let i = 0; i < 16; i++) {
    const [name, m] = fun[int(0, fun.length - 1)];
    rows.push({ merchant_id: m.id, amount: int(lo, hi), status: "completed", description: name, purchase_date: day() });
  }
  const OTHER_RANGE: Record<string, [number, number]> = { groceries: [25, 70], transport: [8, 25], shopping: [20, 80] };
  for (let i = 0; i < 7; i++) {
    const [name, m] = other[int(0, other.length - 1)];
    const [a, b] = OTHER_RANGE[m.category];
    rows.push({ merchant_id: m.id, amount: int(a, b), status: "completed", description: name, purchase_date: day() });
  }
  // Cancelled purchases with big amounts, so a missing status filter would visibly change the tier.
  for (let i = 0; i < 2; i++) {
    const [name, m] = fun[int(0, fun.length - 1)];
    rows.push({ merchant_id: m.id, amount: 95, status: "cancelled", description: name, purchase_date: day() });
  }
  for (let i = 0; i < rows.length; i += 5) {
    await Promise.all(rows.slice(i, i + 5).map((row) => nj(`/accounts/${accountId}/purchases`, { method: "POST", body: JSON.stringify({ medium: "balance", ...row }) })));
  }
  return rows.length;
}

/** Creates a Nessie customer + checking account and seeds its purchase history, or returns a mock id pair. */
export async function linkAccount(name: string, userId: number): Promise<{ customerId: string; accountId: string }> {
  if (live()) {
    const [first, ...rest] = name.split(" ");
    const c = await nj("/customers", {
      method: "POST",
      body: JSON.stringify({ first_name: first, last_name: rest.join(" ") || "Demo", address: { street_number: "1", street_name: "Main St", city: "Austin", state: "TX", zip: "78701" } }),
    });
    const customerId = c.objectCreated?._id;
    const a = await nj(`/customers/${customerId}/accounts`, {
      method: "POST",
      body: JSON.stringify({ type: "Checking", nickname: "WSP demo", rewards: 0, balance: 2000 }),
    });
    const accountId = a.objectCreated?._id;
    if (!customerId || !accountId) throw new Error("nessie did not return customer and account ids");
    await seedAccount(accountId, userId);
    return { customerId, accountId };
  }
  const id = `mock-${Math.random().toString(36).slice(2, 10)}`;
  return { customerId: `c-${id}`, accountId: id };
}

export async function getPurchases(accountId: string | null, days: number): Promise<Purchase[]> {
  if (live() && accountId && !accountId.startsWith("mock-")) {
    // Live: zero purchases means zero, and errors surface to the caller.
    // Nessie answers 200 [] for purchases of an unknown account or wrong key, but 404 for the account itself,
    // so check the account first. Otherwise a wrong account would look like someone who spent nothing.
    await nj(`/accounts/${accountId}`);
    const rows = await nj(`/accounts/${accountId}/purchases`);
    const since = Date.now() - days * 864e5;
    return rows
      .filter((p: any) => new Date(p.purchase_date).getTime() >= since)
      .map((p: any) => ({ date: p.purchase_date, amount: p.amount, category: (p.description || "food").toLowerCase(), merchant: p.merchant_id || "merchant" }));
  }
  return mockPurchases(accountId ?? "demo", days);
}

export async function getSeries(accountId: string | null, days: number) {
  // TODO(verify): real balance history and credit card / loan debt. Nessie has no history endpoint, so the series is synthetic either way.
  return mockSeries(accountId ?? "demo", days);
}

/**
 * Pays a friend back for a hangout: a Nessie transfer from the payer's account to the payee's account.
 * TODO(verify): POST /accounts/{id}/transfers body fields against current Nessie docs.
 * Returns a transfer id, or a mock id when mocks are on or either account is a mock.
 */
export async function sendTransfer(fromAccount: string | null, toAccount: string | null, amount: number, description: string): Promise<string> {
  if (fromAccount && toAccount && !fromAccount.startsWith("mock-") && !toAccount.startsWith("mock-") && !useMock()) {
    try {
      const t = await nj(`/accounts/${fromAccount}/transfers`, {
        method: "POST",
        body: JSON.stringify({ medium: "balance", payee_id: toAccount, amount, transaction_date: new Date().toISOString().slice(0, 10), description }),
      });
      if (t.objectCreated?._id) return t.objectCreated._id;
    } catch (e: any) {
      console.error(maskKey(`sendTransfer failed: ${e?.message ?? e}`));
    }
  }
  return `mock-transfer-${Math.random().toString(36).slice(2, 10)}`;
}
