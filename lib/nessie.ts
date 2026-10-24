// Nessie client. TODO(verify): endpoint paths and account types against current Nessie docs (http://api.nessieisreal.com).
import { mockPurchases, mockSeries, type Purchase } from "./mocks/data";

const BASE = "http://api.nessieisreal.com";
const useMock = () => process.env.USE_MOCKS === "true" || !process.env.NESSIE_API_KEY;
const url = (p: string) => `${BASE}${p}${p.includes("?") ? "&" : "?"}key=${process.env.NESSIE_API_KEY}`;

async function nj(path: string, init?: RequestInit) {
  const res = await fetch(url(path), { ...init, headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`nessie ${res.status}`);
  return res.json();
}

/** Creates a Nessie customer + checking account, or a mock id pair. */
export async function linkAccount(name: string): Promise<{ customerId: string; accountId: string }> {
  if (!useMock()) {
    try {
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
      return { customerId, accountId: a.objectCreated?._id };
    } catch {}
  }
  const id = `mock-${Math.random().toString(36).slice(2, 10)}`;
  return { customerId: `c-${id}`, accountId: id };
}

export async function getPurchases(accountId: string | null, days: number): Promise<Purchase[]> {
  if (accountId && !accountId.startsWith("mock-") && !useMock()) {
    try {
      const rows = await nj(`/accounts/${accountId}/purchases`);
      const since = Date.now() - days * 864e5;
      const list: Purchase[] = rows
        .filter((p: any) => new Date(p.purchase_date).getTime() >= since)
        .map((p: any) => ({ date: p.purchase_date, amount: p.amount, category: (p.description || "food").toLowerCase(), merchant: p.merchant_id || "merchant" }));
      if (list.length) return list;
    } catch {}
  }
  return mockPurchases(accountId ?? "demo", days);
}

export async function getSeries(accountId: string | null, days: number) {
  // TODO(verify): real balance history and credit card / loan debt. Nessie has no history endpoint, so the series is synthetic either way.
  return mockSeries(accountId ?? "demo", days);
}
