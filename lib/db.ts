import { Pool } from "pg";

const g = globalThis as unknown as { _pool?: Pool };

export const pool =
  g._pool ?? new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://localhost:5432/wsp" });
if (process.env.NODE_ENV !== "production") g._pool = pool;

export async function q<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await pool.query(text, params)).rows as T[];
}
export async function q1<T = any>(text: string, params: unknown[] = []): Promise<T | null> {
  return (await q<T>(text, params))[0] ?? null;
}
