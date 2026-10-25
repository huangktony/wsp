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

/** Creates a Nessie customer + checking account, or a mock id pair. */
export async function linkAccount(name: string): Promise<{ customerId: string; accountId: string }> {
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
    return { customerId, accountId };
  }
  const id = `mock-${Math.random().toString(36).slice(2, 10)}`;
  return { customerId: `c-${id}`, accountId: id };
}

export async function getPurchases(accountId: string | null, days: number): Promise<Purchase[]> {
  if (live() && accountId && !accountId.startsWith("mock-")) {
    // Live: zero purchases means zero, and errors surface to the caller.
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
