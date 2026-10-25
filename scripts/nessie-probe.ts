// Verified against the live sandbox (2026-10-24):
//  - POST /merchants: `category` must be a plain string (an array gives 400). GET /merchants/{id} returns it as a string.
//  - POST /accounts/{id}/purchases: `amount` is TRUNCATED to a whole number (12.5 and 12.99 both stored as 12).
//  - Purchase fields: _id, type, merchant_id, payer_id, purchase_date, amount, status, medium, description. No category: join the merchant.
//  - purchase_date in the past is kept as sent. status "cancelled" is accepted and stored.
//  - Purchases do NOT change the account balance (it stays at the initial value).
//  - GET /purchases/{id} returns 403 "Missing Authentication Token"; read purchases via /accounts/{id}/purchases only.
//  - Nessie data is scoped per API key. GET purchases of an unknown account returns 200 [], but GET /accounts/{id} returns 404.
//  - TRANSFERS (verified 2026-10-25): POST /accounts/{id}/transfers requires exactly transaction_date, status, amount, description.
//    `medium`, `payee_id` and `payer_id` are REJECTED ("extra fields not permitted"), so the old sendTransfer body always failed with 400.
//    A transfer is a ONE-SIDED record on the account it was posted to: no payer, no payee, and the other account never sees it.
//    GET /accounts/{id}/transfers (with type=payer, type=payee, or no type) returns the same list. With none it is 404 "No transfers found for this account", not [].
//    Balances do not move. amount is truncated to a whole number (12.5 -> 12), same as purchases (verified on transfers, deposits and withdrawals).
//  - DEPOSITS: POST /accounts/{id}/deposits requires medium, transaction_date, status, amount, description. GET lists them (fields: _id, medium, transaction_date, status, amount, description).
//    WITHDRAWALS: POST /accounts/{id}/withdrawals requires only medium and amount; the response adds type "withdrawal" and payer_id. Both are one-sided, truncate amount, and do not move balances.
//    Neither carries a counterpart account, so anything linking two accounts has to live in `description`.
//  - This script is idempotent: it reuses the probe merchant/customer/account by name and posts purchases only if there are none.
// Creates one merchant, customer, Checking account and purchase in the Nessie sandbox,
// then GETs each back and prints the real JSON shapes. Never prints the API key.
const BASE = "https://api.nessieisreal.com";
const KEY = process.env.NESSIE_API_KEY;
if (!KEY) throw new Error("NESSIE_API_KEY is not set");

const mask = (s: string) => s.split(KEY!).join("***");

async function call(method: string, path: string, body?: unknown, allow404 = false) {
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
  if (res.status === 404 && allow404) return [] as any;
  if (!res.ok) throw new Error(`${method} ${path} failed with ${res.status}`);
  return data as any;
}

async function main() {
  const before = await call("GET", "/customers");
  console.log(`\n(customers before: ${before.length})`);

  // Reuse by name so repeated runs never create duplicates (the first match wins if duplicates already exist).
  const merchants: any[] = await call("GET", "/merchants");
  let merchantId: string = merchants.find((x) => x.name === "WSP Probe Cafe")?._id;
  if (!merchantId) {
    const m = await call("POST", "/merchants", {
      name: "WSP Probe Cafe",
      category: "food",
      address: { street_number: "1", street_name: "Congress Ave", city: "Austin", state: "TX", zip: "78701" },
      geocode: { lat: 30.2672, lng: -97.7431 },
    });
    merchantId = m.objectCreated._id;
  }
  await call("GET", `/merchants/${merchantId}`);

  let customerId: string = before.find((x: any) => x.first_name === "Probe" && x.last_name === "Tester")?._id;
  if (!customerId) {
    const c = await call("POST", "/customers", {
      first_name: "Probe", last_name: "Tester",
      address: { street_number: "1", street_name: "Main St", city: "Austin", state: "TX", zip: "78701" },
    });
    customerId = c.objectCreated._id;
  }
  const accounts: any[] = await call("GET", `/customers/${customerId}/accounts`);
  let accountId: string = accounts.find((x) => x.nickname === "WSP probe")?._id;
  if (!accountId) {
    const a = await call("POST", `/customers/${customerId}/accounts`, { type: "Checking", nickname: "WSP probe", rewards: 0, balance: 2000 });
    accountId = a.objectCreated._id;
  }
  const bal0 = (await call("GET", `/accounts/${accountId}`)).balance;

  const existing: any[] = await call("GET", `/accounts/${accountId}/purchases`);
  if (existing.length === 0) {
    const past = new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10);
    for (const [amount, status, description] of [[12.5, "completed", "probe lunch"], [12.99, "completed", "decimal test"], [7, "cancelled", "cancelled test"]] as const) {
      await call("POST", `/accounts/${accountId}/purchases`, { merchant_id: merchantId, medium: "balance", purchase_date: past, amount, status, description });
    }
    await call("GET", `/accounts/${accountId}/purchases`);
  }
  const bal1 = (await call("GET", `/accounts/${accountId}`)).balance;

  // ---- Transfers, deposits, withdrawals: one record of each kind, only if the account has none. ----
  let account2: string = accounts.find((x) => x.nickname === "WSP probe 2")?._id;
  if (!account2) {
    const a2 = await call("POST", `/customers/${customerId}/accounts`, { type: "Checking", nickname: "WSP probe 2", rewards: 0, balance: 500 });
    account2 = a2.objectCreated._id;
  }
  const today = new Date().toISOString().slice(0, 10);
  const balA0 = (await call("GET", `/accounts/${accountId}`)).balance, balB0 = (await call("GET", `/accounts/${account2}`)).balance;
  if ((await call("GET", `/accounts/${accountId}/transfers`, undefined, true)).length === 0) {
    await call("POST", `/accounts/${accountId}/transfers`, { status: "pending", amount: 12.5, transaction_date: today, description: "probe transfer" });
  }
  if ((await call("GET", `/accounts/${account2}/deposits`, undefined, true)).length === 0) {
    await call("POST", `/accounts/${account2}/deposits`, { medium: "balance", transaction_date: today, status: "pending", amount: 12.5, description: "probe deposit" });
  }
  if ((await call("GET", `/accounts/${accountId}/withdrawals`, undefined, true)).length === 0) {
    await call("POST", `/accounts/${accountId}/withdrawals`, { medium: "balance", transaction_date: today, status: "pending", amount: 12.5, description: "probe withdrawal" });
  }
  console.log("\n--- read back: A = the account that sent, B = the account that received ---");
  for (const [who, id] of [["A", accountId], ["B", account2]] as const) {
    console.log(`\n[${who}]`);
    await call("GET", `/accounts/${id}/transfers?type=payer`, undefined, true);
    await call("GET", `/accounts/${id}/transfers?type=payee`, undefined, true);
    await call("GET", `/accounts/${id}/deposits`, undefined, true);
    await call("GET", `/accounts/${id}/withdrawals`, undefined, true);
  }
  const balA1 = (await call("GET", `/accounts/${accountId}`)).balance, balB1 = (await call("GET", `/accounts/${account2}`)).balance;
  console.log(`\nbalances: A ${balA0} -> ${balA1}, B ${balB0} -> ${balB1} -> these records ${balA1 !== balA0 || balB1 !== balB0 ? "MOVE" : "do NOT move"} balances`);

  console.log("\n=== findings ===");
  console.log(`balance before: ${bal0}, after: ${bal1} -> purchases ${bal1 < bal0 ? "REDUCE" : "do NOT reduce"} balance`);
  const after = await call("GET", "/customers");
  console.log(`customers after: ${after.length}`);
}
main().catch((e) => { console.error("probe failed:", mask(String(e.message ?? e))); process.exit(1); });
