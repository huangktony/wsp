// Pure conservative Nessie sandbox check. No numeric financial value crosses publicOptions.
import { ledgerDollars, type LedgerEntry } from '../ledger';
import type { NessiePurchase } from '../analyze';
import { CHECK_TTL, validDay } from './core';
export type Financial = { available: number | null; checkedAt: number; source: 'nessie-sandbox' | 'simulated' | 'unknown' };
export function availableFunds(balance: number | null, purchases: NessiePurchase[], ledger: LedgerEntry[], owed: number, now = new Date()): number | null {
  if (balance === null || !Number.isFinite(balance) || balance < 0 || !Number.isFinite(owed) || owed < 0) return null;
  const today = now.toISOString().slice(0, 10);
  let net = balance - owed;
  for (const p of purchases) {
    if (p.status === 'cancelled') continue;
    if (!validDay(p.purchase_date) || !Number.isFinite(p.amount) || p.amount < 0) return null;
    if (p.purchase_date <= today) net -= p.amount;
  }
  for (const e of ledger) {
    const amount = ledgerDollars(e);
    if (!validDay(e.date) || !Number.isFinite(amount) || amount < 0 || !['in', 'out'].includes(e.kind)) return null;
    // Pending/unknown inflows are not money available to spend. Outflows are reserved.
    if (e.kind === 'in' && e.status !== 'completed') continue;
    if (e.date <= today) net += e.kind === 'in' ? amount : -amount;
  }
  return Math.max(0, Math.floor(net * 100) / 100);
}
export function budgetCheck(price: number | null, cap: number, funds: Financial, now = Date.now()): boolean | null {
  if (price === null || !Number.isFinite(price) || price < 0 || !Number.isFinite(cap) || cap <= 0) return null;
  if (funds.source !== 'nessie-sandbox' || funds.available === null || !Number.isFinite(funds.available) || now < funds.checkedAt || now - funds.checkedAt >= CHECK_TTL) return null;
  return price <= cap && price <= funds.available;
}
