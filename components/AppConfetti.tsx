// Faint confetti behind every screen. Same shapes and colors as the splash (components/Splash.tsx), spread evenly over the whole
// 270 x 555 canvas, each piece drifting slowly on its own loop (`wsp-roam` in globals.css). The layer's CSS is `.app-confetti`.
import type { CSSProperties, ReactNode } from "react";

const star = (x: number, y: number, r: number) => {
  const k = r * 0.28;
  return `M${x} ${y - r} L${x + k} ${y - k} L${x + r} ${y} L${x + k} ${y + k} L${x} ${y + r} L${x - k} ${y + k} L${x - r} ${y} L${x - k} ${y - k} Z`;
};

/** One drifting piece: wanders up to (dx, dy) and back over `t` seconds. `o` starts it part-way through so pieces never move in step. */
function Roam({ dx, dy, t, o, children }: { dx: number; dy: number; t: number; o: number; children: ReactNode }) {
  return <g className="roam" style={{ "--dx": `${dx}px`, "--dy": `${dy}px`, "--t": `${t}s`, "--o": `${-o * t}s` } as CSSProperties}>{children}</g>;
}

export function AppConfetti() {
  return (
    <div className="app-confetti" aria-hidden="true">
      <svg viewBox="0 0 270 555" preserveAspectRatio="xMidYMid slice">
        <Roam dx={-26} dy={30} t={46} o={0.1}><circle cx="228" cy="52" r="24" fill="#ffc49b" opacity=".85" /></Roam>
        <Roam dx={30} dy={24} t={38} o={0.6}><circle cx="86" cy="40" r="4" fill="#b4cccf" /></Roam>
        <Roam dx={-22} dy={34} t={52} o={0.3}><path d={star(58, 108, 11)} fill="#f3a5bc" /></Roam>
        <Roam dx={-34} dy={-26} t={44} o={0.8}><circle cx="168" cy="162" r="13" fill="none" stroke="#b4cccf" strokeWidth="5" /></Roam>
        <Roam dx={28} dy={-30} t={50} o={0.45}><circle cx="8" cy="214" r="40" fill="var(--confetti-mint)" opacity=".7" /></Roam>
        <Roam dx={-30} dy={26} t={36} o={0.2}><circle cx="228" cy="250" r="6" fill="var(--confetti-mint)" /></Roam>
        <Roam dx={24} dy={-34} t={42} o={0.9}><circle cx="142" cy="226" r="5" fill="#f3a5bc" /></Roam>
        <Roam dx={-28} dy={30} t={48} o={0.55}><path d="M96 276 h14 M103 269 v14" stroke="var(--confetti-sage)" strokeWidth="4" strokeLinecap="round" /></Roam>
        <Roam dx={32} dy={-22} t={40} o={0.7}><circle cx="58" cy="318" r="4" fill="var(--confetti-sage)" /></Roam>
        <Roam dx={-26} dy={-32} t={54} o={0.05}><path d={star(236, 340, 9)} fill="#fff" /></Roam>
        <Roam dx={34} dy={24} t={46} o={0.35}><circle cx="42" cy="394" r="9" fill="#fff" opacity=".7" /></Roam>
        <Roam dx={-24} dy={34} t={38} o={0.85}><circle cx="180" cy="380" r="6" fill="var(--confetti-mint)" /></Roam>
        <Roam dx={-30} dy={-28} t={50} o={0.25}><circle cx="226" cy="438" r="20" fill="none" stroke="#f3a5bc" strokeWidth="7" /></Roam>
        <Roam dx={26} dy={-34} t={44} o={0.65}><path d={star(112, 454, 8)} fill="#ffc49b" /></Roam>
        <Roam dx={-32} dy={24} t={41} o={0.5}><path d="M184 496 h18 M193 487 v18" stroke="var(--confetti-mint)" strokeWidth="5" strokeLinecap="round" /></Roam>
        <Roam dx={30} dy={-30} t={56} o={0.15}><circle cx="14" cy="514" r="52" fill="#ffc49b" opacity=".6" /></Roam>
        <Roam dx={28} dy={-26} t={39} o={0.75}><path d={star(96, 530, 6)} fill="#fff" /></Roam>
        <Roam dx={-26} dy={-30} t={45} o={0.4}><circle cx="146" cy="540" r="5" fill="#f3a5bc" /></Roam>
        <Roam dx={-30} dy={-24} t={49} o={0.95}><path d="M196 560 a40 40 0 0 1 80 0" fill="none" stroke="var(--confetti-mint)" strokeWidth="6" strokeDasharray="2 12" strokeLinecap="round" /></Roam>
        {/* extra pieces, filling the gaps */}
        <Roam dx={-30} dy={28} t={47} o={0.5}><circle cx="148" cy="96" r="14" fill="none" stroke="var(--confetti-mint)" strokeWidth="5" /></Roam>
        <Roam dx={26} dy={32} t={43} o={0.2}><path d={star(24, 160, 7)} fill="#fff" /></Roam>
        <Roam dx={-28} dy={-30} t={51} o={0.7}><path d="M232 176 h14 M239 169 v14" stroke="#f3a5bc" strokeWidth="4" strokeLinecap="round" /></Roam>
        <Roam dx={30} dy={-26} t={37} o={0.3}><circle cx="70" cy="214" r="5" fill="#ffc49b" /></Roam>
        <Roam dx={-24} dy={30} t={53} o={0.85}><circle cx="188" cy="316" r="10" fill="none" stroke="#f3a5bc" strokeWidth="5" /></Roam>
        <Roam dx={28} dy={-28} t={40} o={0.1}><circle cx="30" cy="460" r="11" fill="var(--confetti-mint)" opacity=".8" /></Roam>
        <Roam dx={-26} dy={-24} t={48} o={0.6}><path d={star(150, 420, 7)} fill="#f3a5bc" /></Roam>
        <Roam dx={32} dy={28} t={42} o={0.4}><circle cx="246" cy="292" r="4" fill="#b4cccf" /></Roam>
      </svg>
    </div>
  );
}
