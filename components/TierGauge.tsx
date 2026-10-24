const MAX = 50; // visible scale; the marker is clamped to the bar
const NAMES = ["$", "$$", "$$$"];

export function TierGauge({ tier, avg, cutoffs }: { tier: string; avg: number; cutoffs: number[] }) {
  const edges = [0, ...cutoffs, MAX];
  const pct = (v: number) => `${(Math.min(Math.max(v, 0), MAX) / MAX) * 100}%`;
  const idx = NAMES.indexOf(tier);
  const need = idx >= 0 && idx < cutoffs.length ? Math.floor(cutoffs[idx] - avg) + 1 : 0;
  return (
    <figure>
      <div className="relative" role="img" aria-label={`Average $${avg} per outing, level ${tier}`}>
        <div className="flex h-4 gap-1">
          {NAMES.map((n, i) => (
            <div key={n} className={`rounded-full ${i === idx ? "bg-sage" : "bg-mintsoft"}`} style={{ width: `${((edges[i + 1] - edges[i]) / MAX) * 100}%` }} />
          ))}
        </div>
        <div className="absolute -top-1 h-6 w-1 -translate-x-1/2 rounded-full bg-ink" style={{ left: pct(avg) }} />
      </div>
      <div className="mt-1 flex text-xs font-semibold text-muted">
        {NAMES.map((n, i) => <span key={n} style={{ width: `${((edges[i + 1] - edges[i]) / MAX) * 100}%` }}>{n}</span>)}
      </div>
      <figcaption className="mt-2 text-sm text-muted">
        Avg ${avg} per outing. {need > 0 ? `$${need} more per outing moves you to ${NAMES[idx + 1]}.` : "Top level."}
      </figcaption>
    </figure>
  );
}
