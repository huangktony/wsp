export function Smiley({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className="block shrink-0">
      <g transform="rotate(-14 50 50)">
        <circle cx="50" cy="50" r="46" fill="var(--pink)" />
        <ellipse cx="34" cy="42" rx="5.5" ry="9" fill="var(--logo-ink)" />
        <ellipse cx="66" cy="42" rx="5.5" ry="9" fill="var(--logo-ink)" />
        <path d="M26 60 Q50 86 76 58" fill="none" stroke="var(--logo-ink)" strokeWidth="7" strokeLinecap="round" />
      </g>
    </svg>
  );
}
