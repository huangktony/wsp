import type { CSSProperties } from "react";

// Art for the login hero: the "Peek + confetti" design.
// - LoginConfetti: soft drifting shapes behind the wordmark, kept clear of the text.
// - WinkingSmiley: the big peeking smiley, which winks (and tips its head) every 5 seconds.

const i = (n: number) => ({ "--i": n }) as CSSProperties;

function Star({ x, y, r, fill, n }: { x: number; y: number; r: number; fill: string; n: number }) {
  const k = r * 0.28;
  const d = `M${x} ${y - r} L${x + k} ${y - k} L${x + r} ${y} L${x + k} ${y + k} L${x} ${y + r} L${x - k} ${y + k} L${x - r} ${y} L${x - k} ${y - k} Z`;
  return <path className="login-cf" style={i(n)} d={d} fill={fill} />;
}

/** Drawn on a 390 x 372 canvas, the size of the hero. */
export function LoginConfetti() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 390 372" preserveAspectRatio="xMinYMin slice" aria-hidden="true">
      <circle className="login-cf" style={i(0)} cx="-4" cy="34" r="46" fill="#cbe6c7" opacity=".75" />
      <Star x={150} y={46} r={9} fill="#fff" n={1} />
      <circle className="login-cf" style={i(2)} cx="86" cy="52" r="4" fill="#28536b" opacity=".3" />
      <path className="login-cf" style={i(3)} d="M202 22 h16 M210 14 v16" stroke="#28536b" strokeOpacity=".3" strokeWidth="4.5" strokeLinecap="round" />
      <path className="login-cf" style={i(4)} d="M30 262 q9 -12 18 0 t18 0 t18 0" fill="none" stroke="#28536b" strokeOpacity=".35" strokeWidth="5" strokeLinecap="round" />
      <Star x={160} y={286} r={11} fill="#f3a5bc" n={5} />
      <circle className="login-cf" style={i(6)} cx="112" cy="314" r="4.5" fill="#fff" opacity=".9" />
      <circle className="login-cf" style={i(7)} cx="8" cy="340" r="36" fill="#ffc49b" opacity=".75" />
      <Star x={110} y={248} r={6} fill="#ffc49b" n={8} />
    </svg>
  );
}

/** Same tilted smiley as <Logo>, with its right eye and head grouped so they can animate. */
export function WinkingSmiley({ size = 320, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden="true">
      <g transform="rotate(-14 50 50)">
        <g className="login-face">
          <circle cx="50" cy="50" r="46" fill="var(--pink)" />
          <ellipse cx="34" cy="42" rx="5.5" ry="9" fill="var(--logo-ink)" />
          <ellipse className="login-wink" cx="66" cy="42" rx="5.5" ry="9" fill="var(--logo-ink)" />
          <path d="M26 60 Q50 86 76 58" stroke="var(--logo-ink)" strokeWidth="7" fill="none" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}
