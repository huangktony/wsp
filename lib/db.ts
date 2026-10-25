import { Pool } from "pg";

const g = globalThis as unknown as { _pool?: Pool };

const raw = process.env.DATABASE_URL ?? "postgres://localhost:5432/wsp";
const local = /@(localhost|127\.0\.0\.1)[:/]|^postgres(ql)?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(raw);
// Hosted databases (Tiger Data) require SSL. Node does not trust their certificate chain
// (SELF_SIGNED_CERT_IN_CHAIN), so we drop sslmode from the URL and encrypt without verifying the server.
// TODO(decision): pin the provider's CA certificate instead of rejectUnauthorized: false.
const url = local ? raw : raw.replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, "");

// connectionTimeoutMillis: fail with an error after 8s instead of hanging forever when the database can't be reached.
export const pool = g._pool ?? new Pool({ connectionString: url, ssl: local ? undefined : { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
if (process.env.NODE_ENV !== "production") g._pool = pool;

export async function q<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await pool.query(text, params)).rows as T[];
}
export async function q1<T = any>(text: string, params: unknown[] = []): Promise<T | null> {
  return (await q<T>(text, params))[0] ?? null;
}