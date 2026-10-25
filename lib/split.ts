// Pure split math (no I/O), shared by the server (computeSplit) and the final screen (instant updates before the server answers).
export type SplitMode = "even" | "items";

export function splitAmounts<M extends { user_id: number; skips: number[] }>(stopCosts: number[], members: M[], mode: SplitMode) {
  const rows = members.map((m) => {
    const cents = stopCosts.reduce((a, c, i) => a + (m.skips.includes(i) ? 0 : Math.round(c * 100)), 0);
    return { ...m, going: m.skips.length < stopCosts.length, itemCents: cents, cents: 0 };
  });
  const total = rows.reduce((a, x) => a + x.itemCents, 0);
  if (mode === "items") rows.forEach((x) => (x.cents = x.itemCents));
  else {
    const going = rows.filter((x) => x.going);
    const base = going.length ? Math.floor(total / going.length) : 0;
    going.forEach((x, i) => (x.cents = base + (i < total - base * going.length ? 1 : 0)));
  }
  return { total: total / 100, rows: rows.map(({ itemCents, cents, ...x }) => ({ ...x, amount: cents / 100 })) };
}
