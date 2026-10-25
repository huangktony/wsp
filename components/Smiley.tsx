export function Smiley({
  size = 48,
  fill = "fill-orchid",
  faceColor,
  featureColor = "var(--logo-ink)",
}: {
  size?: number;
  fill?: string;
  faceColor?: string;
  featureColor?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className="block shrink-0">
      <g transform="rotate(-14 50 50)">
        <circle cx="50" cy="50" r="46" className={faceColor ? undefined : fill} fill={faceColor} />
        <ellipse cx="34" cy="42" rx="5.5" ry="9" fill={featureColor} />
        <ellipse cx="66" cy="42" rx="5.5" ry="9" fill={featureColor} />
        <path d="M26 60 Q50 86 76 58" fill="none" stroke={featureColor} strokeWidth="7" strokeLinecap="round" />
      </g>
    </svg>
  );
}
