// Verified against the live sandbox (2026-10-24):
//  - POST /merchants: `category` must be a plain string (an array gives 400). GET /merchants/{id} returns it as a string.
//  - POST /accounts/{id}/purchases: `amount` is TRUNCATED to a whole number (12.5 and 12.99 both stored as 12).
//  - Purchase fields: _id, type, merchant_id, payer_id, purchase_date, amount, status, medium, description. No category: join the merchant.
//  - purchase_date in the past is kept as sent. status "cancelled" is accepted and stored.
//  - Purchases do NOT change the account balance (it stays at the initial value).
//  - GET /purchases/{id} returns 403 "Missing Authentication Token"; read purchases via /accounts/{id}/purchases only.
//  - Each run of this script leaves a probe merchant/customer/account behind (not idempotent).
// Creates one merchant, customer, Checking account and purchase in the Nessie sandbox,
// then GETs each back and prints the real JSON shapes. Never prints the API key.
const BASE = "https://api.nessieisreal.com";
const KEY = process.env.NESSIE_API_KEY;
if (!KEY) throw new Error("NESSIE_API_KEY is not set");

const mask = (s: string) => s.split(KEY!).join("***");

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}${path.includes("?") ? "&" : "?"}key=${KEY}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const text = await res.text();
  let data: unknown = text;
  try { data = JSON.parse(text); } catch {}
  console.log(`\n${method} ${path}  ->  ${res.status}`);
  console.log(mask(JSON.stringify(data, null, 2)));
  if (!res.ok) throw new Error(`${method} ${path} failed with ${res.status}`);
  return data as any;
}

async function main() {
  const before = await call("GET", "/customers");
  console.log(`\n(customers before: ${before.length})`);

  const m = await call("POST", "/merchants", {
    name: "WSP Probe Cafe",
    category: "food",
    address: { street_number: "1", street_name: "Congress Ave", city: "Austin", state: "TX", zip: "78701" },
    geocode: { lat: 30.2672, lng: -97.7431 },
  });
  const merchantId = m.objectCreated._id;
  await call("GET", `/merchants/${merchantId}`);

  const c = await call("POST", "/customers", {
    first_name: "Probe", last_name: "Tester",
    address: { street_number: "1", street_name: "Main St", city: "Austin", state: "TX", zip: "78701" },
  });
  const customerId = c.objectCreated._id;
  const a = await call("POST", `/customers/${customerId}/accounts`, { type: "Checking", nickname: "WSP probe", rewards: 0, balance: 2000 });
  const accountId = a.objectCreated._id;
  const bal0 = (await call("GET", `/accounts/${accountId}`)).balance;

  const past = new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10);
  const p = await call("POST", `/accounts/${accountId}/purchases`, {
    merchant_id: merchantId, medium: "balance", purchase_date: past, amount: 12.5, status: "completed", description: "probe lunch",
  });
  // Decimal handling and cancelled status.
  await call("POST", `/accounts/${accountId}/purchases`, { merchant_id: merchantId, medium: "balance", purchase_date: past, amount: 12.99, status: "completed", description: "decimal test" });
  await call("POST", `/accounts/${accountId}/purchases`, { merchant_id: merchantId, medium: "balance", purchase_date: past, amount: 7, status: "cancelled", description: "cancelled test" });
  await call("GET", `/accounts/${accountId}/purchases`);
  const bal1 = (await call("GET", `/accounts/${accountId}`)).balance;

  console.log("\n=== findings ===");
  console.log(`balance before purchases: ${bal0}, after 3 purchases (12.5, 12.99 completed, 7 cancelled): ${bal1} -> purchases ${bal1 < bal0 ? "REDUCE" : "do NOT reduce"} balance`);
  console.log(`requested purchase_date ${past}; see GET purchases above for what was stored`);
  const after = await call("GET", "/customers");
  console.log(`customers after: ${after.length}`);
}
main().catch((e) => { console.error("probe failed:", mask(String(e.message ?? e))); process.exit(1); });
