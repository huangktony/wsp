// Brand pieces: the tilted smiley and the "wsp" wordmark.

export function Logo({ size = 64, className = "", decorative = false }: { size?: number; className?: string; decorative?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "WSP"}
      aria-hidden={decorative || undefined}
    >
      <g transform="rotate(-14 50 50)">
        <circle cx="50" cy="50" r="46" fill="var(--pink)" />
        <ellipse cx="34" cy="42" rx="5.5" ry="9" fill="var(--ink)" />
        <ellipse cx="66" cy="42" rx="5.5" ry="9" fill="var(--ink)" />
        <path d="M26 60 Q50 86 76 58" stroke="var(--ink)" strokeWidth="7" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return <div className={`font-brand font-extrabold leading-none tracking-[-0.05em] ${className}`}>wsp</div>;
}
