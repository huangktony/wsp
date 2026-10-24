type Pt = { date: string; value: number };

export function BalanceDebtChart({ balance, debt }: { balance: Pt[]; debt: Pt[] }) {
  const W = 340, H = 160, P = 8;
  const all = [...balance, ...debt].map((p) => p.value);
  const lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
  const path = (pts: Pt[]) =>
    pts.map((p, i) => `${i ? "L" : "M"}${P + (i / Math.max(pts.length - 1, 1)) * (W - 2 * P)},${H - P - ((p.value - lo) / span) * (H - 2 * P)}`).join(" ");
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Balance versus debt over time">
        <path d={path(balance)} fill="none" stroke="var(--sage)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d={path(debt)} fill="none" stroke="var(--deep-pink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <figcaption className="mt-1 flex gap-4 text-xs font-semibold text-muted">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-sage" />Balance ${balance.at(-1)?.value}</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-deep" />Debt ${debt.at(-1)?.value}</span>
      </figcaption>
    </figure>
  );
}
