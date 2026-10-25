"use client";
import Link from "next/link";
import { BackButton } from "./BackButton";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { PROFILES, PROFILE_LABELS, type Spender } from "@/lib/profiles";
import { Logo, Wordmark } from "./Logo";
import { Err } from "./Page";

const field = "h-14 w-full rounded-2xl border-2 border-field bg-surface px-4 text-base text-ink outline-none focus:border-ink";

function useAuthSubmit() {
  const r = useRouter();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function go(fn: () => Promise<unknown>) {
    setBusy(true); setErr("");
    try { await fn(); r.push("/groups"); r.refresh(); }
    catch (e: any) { setErr(e.message); setBusy(false); }
  }
  return { err, busy, go };
}

export function LoginForm() {
  const { err, busy, go } = useAuthSubmit();
  const [f, setF] = useState({ email: "", password: "" });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    go(() => api("/api/auth/login", "POST", f));
  };
  return (
    <main className="flex min-h-screen flex-col">
      <div className="relative h-[372px] shrink-0 overflow-hidden bg-sage px-7 pt-[84px] text-ink">
        <Logo size={320} decorative className="absolute -right-24 top-[30px]" />
        <h1 className="relative"><Wordmark className="text-[96px]" /></h1>
        <p className="relative mt-3.5 max-w-[170px] font-brand text-lg font-bold leading-snug text-sageink">afford. hang.</p>
      </div>
      <form onSubmit={submit} className="relative z-10 -mt-8 flex flex-1 flex-col gap-3.5 rounded-t-[32px] bg-surface px-6 pb-7 pt-7">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-[13px] font-bold text-muted">Email</label>
          <input id="email" className={field} type="email" placeholder="you@school.edu" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pw" className="text-[13px] font-bold text-muted">Password</label>
          <input id="pw" className={field} type="password" placeholder="Password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
        </div>
        <Err msg={err} />
        <button disabled={busy} className="mt-1.5 flex h-14 w-full items-center justify-center rounded-2xl bg-panel text-[17px] font-bold text-white active:opacity-80 disabled:opacity-50">Log in</button>
        <button type="button" disabled={busy} onClick={() => go(() => api("/api/auth/demo", "POST"))} className="flex h-14 w-full items-center justify-center rounded-2xl bg-mint text-[17px] font-bold text-ink active:opacity-80 disabled:opacity-50">Continue with demo account</button>
        <p className="mt-auto pt-2 text-center text-[15px] font-semibold text-muted">New here? <Link href="/signup" className="font-bold text-wine">Create an account</Link></p>
      </form>
    </main>
  );
}

export function SignupForm() {
  const { err, busy, go } = useAuthSubmit();
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [choice, setChoice] = useState<Spender | "skip">("average");
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    go(async () => {
      await api("/api/auth/signup", "POST", f);
      if (choice !== "skip") await api("/api/bank/link", "POST", { profile: choice });
    });
  };
  return (
    <form onSubmit={submit} className="flex min-h-screen flex-col gap-[18px] px-6 pt-14">
      <BackButton href="/login" className="mb-2" />
      <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight">Let&apos;s get you in.</h1>
      <p className="text-base text-muted">Three quick things and you&apos;re planning.</p>
      <div className="flex flex-col gap-3">
        <input className={field} aria-label="Name" placeholder="Name" autoComplete="name" value={f.name} onChange={set("name")} required />
        <input className={field} aria-label="Email" type="email" placeholder="Email" autoComplete="email" value={f.email} onChange={set("email")} required />
        <input className={field} aria-label="Password" type="password" placeholder="Password, 8+ characters" autoComplete="new-password" minLength={8} value={f.password} onChange={set("password")} required />
      </div>
      <div className="flex flex-col gap-3 rounded-[20px] bg-panel p-[18px] text-white">
        <div className="flex items-center justify-between">
          <span className="text-[17px] font-extrabold">Link a bank account</span>
          <span className="rounded-xl bg-peach px-2.5 py-1 text-xs font-extrabold text-ink">DEMO</span>
        </div>
        <p className="text-sm leading-relaxed text-panelsoft">WSP reads your spending to find a comfort level for group plans. Friends only see the lowest level in the group, never your purchases.</p>
        <div role="radiogroup" aria-label="Demo bank account" className="flex flex-wrap gap-2">
          {[...PROFILES, "skip" as const].map((o) => (
            <button key={o} type="button" role="radio" aria-checked={choice === o} disabled={busy} onClick={() => setChoice(o)}
              className={`rounded-full px-3.5 py-2.5 text-sm font-bold disabled:opacity-50 ${choice === o ? "bg-peach text-ink" : "bg-[#1E4259] text-white"}`}>
              {o === "skip" ? "Skip for now" : PROFILE_LABELS[o]}
            </button>
          ))}
        </div>
        {choice === "skip" && <p className="text-sm text-panelsoft">You can link a demo account later from Budget.</p>}
      </div>
      <Err msg={err} />
      <div className="sticky bottom-0 -mx-6 mt-auto border-t border-line bg-surface px-6 pb-[30px] pt-3.5">
        <button className="btn font-extrabold" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
      </div>
    </form>
  );
}
