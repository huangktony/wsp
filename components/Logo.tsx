export function Logo({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="WSP">
      <circle cx="32" cy="32" r="30" fill="var(--pink)" />
      <ellipse cx="22" cy="26" rx="3.5" ry="5.5" fill="var(--ink)" />
      <ellipse cx="42" cy="26" rx="3.5" ry="5.5" fill="var(--ink)" />
      <path d="M20 38 Q32 50 44 38" stroke="var(--ink)" strokeWidth="3.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}
