"use client";
import { useRef } from "react";
import { comfortCaption, effectiveTier } from "@/lib/comfort";
import { TIER_CUTOFFS, type Tier } from "@/lib/tiers";

const TIERS: Tier[] = ["$", "$$", "$$$"];
const NAME: Record<Tier, string> = { $: "lowest budget", $$: "medium budget", $$$: "highest budget" };
const RANGE: Record<Tier, string> = {
  $: `Up to $${TIER_CUTOFFS[0]}`,
  $$: `Over $${TIER_CUTOFFS[0]} through $${TIER_CUTOFFS[1]}`,
  $$$: `Over $${TIER_CUTOFFS[1]}`,
};
const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo";

// Semicircle geometry: three 60 degree arcs from the left (180) over the top to the right (0), with small gaps.
const CX = 150, CY = 150, R = 110, SW = 30, GAP = 3;
const point = (deg: number) => [CX + R * Math.cos((deg * Math.PI) / 180), CY - R * Math.sin((deg * Math.PI) / 180)];
const arc = (i: number) => {
  const [x1, y1] = point(180 - 60 * i - GAP), [x2, y2] = point(180 - 60 * (i + 1) + GAP);
  return `M${x1.toFixed(1)},${y1.toFixed(1)} A${R},${R} 0 0 1 ${x2.toFixed(1)},${y2.toFixed(1)}`;
};

/**
 * Pick a comfort level for one group. `suggested` comes from spending (null if not linked), `picked` is the member's own choice
 * (null = use the suggestion). The three $ labels are the accessible radio buttons (roving tab stop, arrow keys); the arc
 * segments are larger touch targets for the same choices and are hidden from screen readers so each level is announced once.
 */
export function ComfortPicker({ suggested, avg, picked, onPick }: { suggested: Tier | null; avg: number | null; picked: Tier | null; onPick: (t: Tier | null) => void }) {
  const current = effectiveTier(picked, suggested);
  const cap = comfortCaption({ suggested, picked, avg });
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const choose = (t: Tier) => onPick(t === suggested ? null : t);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const move = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!move) return;
    e.preventDefault();
    const n = (i + move + TIERS.length) % TIERS.length;
    choose(TIERS[n]);
    refs.current[n]?.focus();
  };
  const tabbable = current ? TIERS.indexOf(current) : 0; // roving tab stop: the selected level, or the first when none is chosen

  return (
    <div className="rounded-3xl bg-pistachio p-5 text-indigo">
      <div role="radiogroup" aria-label="Comfort level for this group">
        <div className="relative mx-auto w-full max-w-[300px]">
          <svg viewBox="0 0 300 156" className="block w-full" aria-hidden="true">
            {TIERS.map((t, i) => (
              <g key={t}>
                <path d={arc(i)} fill="none" stroke="var(--outline)" strokeOpacity="0.35" strokeWidth={SW + 3} />
                <path d={arc(i)} fill="none" stroke={t === current ? "var(--indigo)" : "var(--surface)"} strokeWidth={SW} />
                <path d={arc(i)} fill="none" stroke="transparent" strokeWidth={SW + 18} style={{ cursor: "pointer" }} onClick={() => choose(t)} />
              </g>
            ))}
          </svg>
          <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center">
            <p className="text-[36px] font-extrabold leading-none tracking-[-1.5px]">{current ?? "–"}</p>
            <p className="mt-1 text-sm font-semibold text-secondary">{current ? "your comfort level" : "pick a level"}</p>
          </div>
        </div>
        <div className="mt-1 grid grid-cols-3 items-stretch gap-1">
          {TIERS.map((t, i) => (
            <button
              key={t} ref={(el) => { refs.current[i] = el; }} type="button" role="radio" aria-checked={t === current}
              aria-label={`${t}, ${NAME[t]}, ${RANGE[t]} per person per stop`} tabIndex={i === tabbable ? 0 : -1} onClick={() => choose(t)} onKeyDown={(e) => onKey(e, i)}
              className={`flex min-h-11 min-w-0 flex-col items-center justify-start gap-1 rounded-2xl px-1 py-2 text-lg font-extrabold ${focus} ${t === current ? "bg-indigo text-surface" : "text-indigo"}`}
            >
              <span>{t}</span>
              <span className="text-xs font-semibold leading-4">{RANGE[t]}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="mt-3 text-xs text-secondary">Spending guidance per person, per stop. Prices are estimates; a plan with multiple stops can cost more.</p>
      <p className="mt-3 text-sm text-indigo" aria-live="polite">
        {cap.bold ? <>{cap.text.split(cap.bold)[0]}<b>{cap.bold}</b>{cap.text.split(cap.bold)[1]}</> : cap.text}
      </p>
      {cap.showReset && <button type="button" onClick={() => onPick(null)} className={`mt-1 inline-flex min-h-11 items-center rounded-full px-1 text-sm font-bold underline ${focus}`}>Use suggested</button>}
    </div>
  );
}
