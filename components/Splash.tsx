"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";

// Splash screen: "Friends arrive" animation on the "Confetti" background.
// Three friends drop in, the first two turn into "w" and "s", and the smiley hops over as "p" appears.
// Plays once per browser tab session, then fades out to reveal the app underneath.

export const SPLASH_KEY = "wsp-splash-seen";

/** Inlined in <head> so a returning visit in the same tab never flashes the splash. */
export const splashScript = `try{if(sessionStorage.getItem("${SPLASH_KEY}"))document.documentElement.classList.add("wsp-splash-skip")}catch(e){}`;

const DURATION = 2600; // the animation itself (matches --D in globals.css)
const HOLD = 600; // pause on the finished logo
const FADE = 450; // fade-out to the app

type Phase = "measure" | "play" | "leave" | "done";

export function Splash() {
  const word = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("measure");

  useEffect(() => {
    if (document.documentElement.classList.contains("wsp-splash-skip")) { setPhase("done"); return; }
    try { sessionStorage.setItem(SPLASH_KEY, "1"); } catch {}
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers: number[] = [];
    let started = false;
    const start = () => {
      if (started || !word.current) return;
      started = true;
      measure(word.current);
      setPhase("play");
      const total = reduce ? 900 : DURATION + HOLD;
      timers.push(window.setTimeout(() => setPhase("leave"), total));
      timers.push(window.setTimeout(() => setPhase("done"), total + FADE));
    };
    (document.fonts?.ready ?? Promise.resolve()).then(start);
    timers.push(window.setTimeout(start, 1500)); // never wait more than 1.5s for fonts
    return () => timers.forEach(clearTimeout);
  }, []);

  const skip = () => {
    if (phase !== "play") return;
    setPhase("leave");
    window.setTimeout(() => setPhase("done"), FADE);
  };

  if (phase === "done") return null;
  return (
    <div className={`wsp-splash${phase !== "measure" ? " play" : ""}${phase === "leave" ? " leave" : ""}`} onClick={skip} role="status">
      <span className="sr-only">Loading WSP</span>
      <div className="wsp-splash-bg" aria-hidden="true"><Confetti /></div>
      <div className="wsp-splash-word" ref={word} aria-hidden="true">
        <span className="l l1">w</span><span className="l l2">s</span><span className="l l3">p</span>
        <span className="base" />
        <span className="friend fa" />
        <span className="friend fb" />
        <span className="ball-x"><span className="ball-y"><span className="ball-sq"><SplashSmiley /></span></span></span>
      </div>
      <div className="wsp-splash-tag" aria-hidden="true">afford. hang.</div>
    </div>
  );
}

/** Reads where each letter sits so the friends land on w and s, the smiley on p, and it ends just right of the p. */
function measure(word: HTMLElement) {
  const ball = word.querySelector<HTMLElement>(".ball-x")!.offsetWidth;
  const letters = [...word.querySelectorAll<HTMLElement>(".l")];
  const baseline = word.querySelector<HTMLElement>(".base")!.offsetTop;
  const gap = parseFloat(getComputedStyle(word).fontSize) * 0.054;
  letters.forEach((l, n) => word.style.setProperty(`--x${n + 1}`, `${l.offsetLeft + l.offsetWidth / 2 - ball / 2}px`));
  const p = letters[2];
  word.style.setProperty("--xend", `${p.offsetLeft + p.offsetWidth + gap}px`);
  word.style.setProperty("--base", `${Math.round((word.offsetHeight - baseline) * 0.98)}px`);
}

function SplashSmiley() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <g transform="rotate(-14 50 50)">
        <circle cx="50" cy="50" r="46" fill="#f3a5bc" />
        <g className="eyes">
          <ellipse cx="34" cy="42" rx="5.5" ry="9" fill="#28536b" />
          <ellipse cx="66" cy="42" rx="5.5" ry="9" fill="#28536b" />
        </g>
        <path d="M26 60 Q50 86 76 58" fill="none" stroke="#28536b" strokeWidth="7" strokeLinecap="round" />
      </g>
    </svg>
  );
}

const i = (n: number) => ({ "--i": n }) as CSSProperties;

function Star({ x, y, r, fill, n }: { x: number; y: number; r: number; fill: string; n: number }) {
  const k = r * 0.28;
  const d = `M${x} ${y - r} L${x + k} ${y - k} L${x + r} ${y} L${x + k} ${y + k} L${x} ${y + r} L${x - k} ${y + k} L${x - r} ${y} L${x - k} ${y - k} Z`;
  return <path className="cf" style={i(n)} d={d} fill={fill} />;
}

/** Background art on a 270 x 555 canvas; shapes stay near the edges so the logo has room. Also used by the Finding plans screen. */
export function Confetti() {
  return (
    <svg viewBox="0 0 270 555" preserveAspectRatio="xMidYMid slice">
      <circle className="cf" style={i(0)} cx="8" cy="70" r="46" fill="#cbe6c7" opacity=".7" />
      <circle className="cf" style={i(1)} cx="262" cy="150" r="30" fill="#ffc49b" opacity=".85" />
      <circle className="cf" style={i(2)} cx="20" cy="560" r="70" fill="#ffc49b" opacity=".6" />
      <circle className="cf" style={i(3)} cx="250" cy="505" r="22" fill="none" stroke="#f3a5bc" strokeWidth="7" />
      <path className="cf" style={i(4)} d="M36 168 q9 -12 18 0 t18 0 t18 0" fill="none" stroke="#28536b" strokeOpacity=".35" strokeWidth="5" strokeLinecap="round" />
      <path className="cf" style={i(5)} d="M176 410 q9 -12 18 0 t18 0 t18 0" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="5" strokeLinecap="round" />
      <Star x={206} y={78} r={13} fill="#f3a5bc" n={6} />
      <Star x={64} y={418} r={10} fill="#fff" n={7} />
      <Star x={238} y={340} r={8} fill="#ffc49b" n={8} />
      <Star x={44} y={262} r={6} fill="#fff" n={9} />
      <path className="cf" style={i(10)} d="M150 470 h18 M159 461 v18" stroke="#cbe6c7" strokeWidth="5" strokeLinecap="round" />
      <path className="cf" style={i(11)} d="M98 92 h14 M105 85 v14" stroke="#28536b" strokeOpacity=".3" strokeWidth="4" strokeLinecap="round" />
      <circle className="cf" style={i(12)} cx="140" cy="118" r="5" fill="#28536b" opacity=".3" />
      <circle className="cf" style={i(13)} cx="226" cy="236" r="6" fill="#cbe6c7" />
      <circle className="cf" style={i(14)} cx="108" cy="512" r="5" fill="#f3a5bc" />
      <circle className="cf" style={i(15)} cx="30" cy="350" r="4" fill="#28536b" opacity=".3" />
      <path className="cf" style={i(16)} d="M196 560 a40 40 0 0 1 80 0" fill="none" stroke="#cbe6c7" strokeWidth="6" strokeDasharray="2 12" strokeLinecap="round" />
    </svg>
  );
}
