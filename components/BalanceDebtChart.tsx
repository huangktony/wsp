type Pt = { date: string; value: number };

/**
 * Area chart for the dark hero card: a light line with a soft green fill (balance), dashed gridlines and end dots.
 * `debt` draws a second pink line, but only pass it if you have a real history of what was owed (there is none today).
 */
export function BalanceDebtChart({ balance, debt }: { balance: Pt[]; debt?: Pt[] }) {
  const W = 340, H = 132, PX = 10, PY = 16;
  if (balance.length < 2) return null;
  const all = [...balance, ...(debt ?? [])].map((p) => p.value);
  const lo = Math.min(...all), hi = Math.max(...all), span = hi - lo;
  const x = (i: number, n: number) => PX + (i / Math.max(n - 1, 1)) * (W - 2 * PX);
  const y = (v: number) => (span === 0 ? H / 2 : H - PY - ((v - lo) / span) * (H - 2 * PY));
  const line = (pts: Pt[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(i, pts.length).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line(balance)} L${x(balance.length - 1, balance.length).toFixed(1)},${H - PY} L${x(0, balance.length).toFixed(1)},${H - PY} Z`;
  const first = balance[0], last = balance[balance.length - 1];
  return (
    <figure className="mt-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Balance over the last 30 days, from $${Math.round(first.value)} to $${Math.round(last.value)}`}>
        <defs>
          <linearGradient id="balance-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--panel-soft)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--panel-soft)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={PX} x2={W - PX} y1={PY + f * (H - 2 * PY)} y2={PY + f * (H - 2 * PY)} stroke="currentColor" strokeOpacity="0.18" strokeDasharray="3 5" />)}
        <path d={area} fill="url(#balance-fill)" />
        <path d={line(balance)} fill="none" stroke="var(--panel-soft)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {debt && debt.length > 1 && <path d={line(debt)} fill="none" stroke="var(--pink)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
        <circle cx={x(0, balance.length)} cy={y(first.value)} r="3" fill="var(--panel-soft)" />
        <circle cx={x(balance.length - 1, balance.length)} cy={y(last.value)} r="5" fill="var(--panel-soft)" stroke="var(--panel)" strokeWidth="2" />
      </svg>
      <figcaption className="mt-1 flex justify-between text-xs font-semibold text-panelsoft">
        <span>30 days ago</span>
        <span>Today</span>
      </figcaption>
    </figure>
  );
}
