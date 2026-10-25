export function Logo({ size = 64, className, decorative = false }: { size?: number; className?: string; decorative?: boolean }) {
  const a11y = decorative ? { "aria-hidden": true } : { role: "img", "aria-label": "WSP" };
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} {...a11y}>
      <g transform="rotate(-14 50 50)">
        <circle cx="50" cy="50" r="46" fill="var(--pink)" />
        <ellipse cx="34" cy="42" rx="5.5" ry="9" fill="var(--logo-ink)" />
        <ellipse cx="66" cy="42" rx="5.5" ry="9" fill="var(--logo-ink)" />
        <path d="M26 60 Q50 86 76 58" stroke="var(--logo-ink)" strokeWidth="7" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return <div className={`font-brand font-extrabold leading-none tracking-[-0.05em] ${className}`}>wsp</div>;
}
