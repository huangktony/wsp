// Deterministic sample data so demos never break. Seeded by account id.
export type Purchase = { date: string; amount: number; category: string; merchant: string };

function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) / 4294967296);
}
const MERCH: [string, string, number][] = [
  ["food", "Torchy's Tacos", 14], ["food", "Franklin BBQ", 28], ["food", "Jeni's Ice Cream", 9],
  ["entertainment", "Alamo Drafthouse", 22], ["entertainment", "Barton Springs Mini Golf", 16],
  ["groceries", "H-E-B", 48], ["transport", "Uber", 18], ["shopping", "Target", 35],
];
export function mockPurchases(seed: string, days: number): Purchase[] {
  const r = rng(seed || "demo");
  const out: Purchase[] = [];
  for (let d = days - 1; d >= 0; d--) {
    const n = r() < 0.6 ? 1 : 0;
    for (let i = 0; i < n; i++) {
      const [category, merchant, base] = MERCH[Math.floor(r() * MERCH.length)];
      const date = new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
      out.push({ date, category, merchant, amount: Math.round(base * (0.7 + r() * 0.7) * 100) / 100 });
    }
  }
  return out;
}
export function mockSeries(seed: string, days: number) {
  const r = rng(seed + "series");
  let bal = 1800 + r() * 800, debt = 900 + r() * 500;
  const balance: { date: string; value: number }[] = [], debtS: { date: string; value: number }[] = [];
  for (let d = days - 1; d >= 0; d--) {
    const date = new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
    bal += (r() - 0.45) * 60; debt += (r() - 0.55) * 30;
    balance.push({ date, value: Math.round(bal) }); debtS.push({ date, value: Math.round(Math.max(0, debt)) });
  }
  return { balance, debt: debtS };
}
