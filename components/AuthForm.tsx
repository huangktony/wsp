"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Logo, Wordmark } from "./Logo";
import { Err } from "./Page";

const field = "h-14 w-full rounded-2xl border-2 border-field bg-white px-4 text-base text-ink outline-none focus:border-ink";

// Shared by both screens: run a request, then go to Groups (or show the error).
function useAuthSubmit() {
  const r = useRouter();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function go(fn: () => Promise<unknown>) {
    setBusy(true); setErr("");
    try { await fn(); r.push("/groups"); r.refresh(); } catch (e: any) { setErr(e.message); setBusy(false); }
  }
  return { err, busy, go };
}

export function LoginForm() {
  const [f, setF] = useState({ email: "", password: "" });
  const { err, busy, go } = useAuthSubmit();
  const submit = (e: React.FormEvent) => { e.preventDefault(); go(() => api("/api/auth/login", "POST", f)); };

  return (
    <main className="flex min-h-screen flex-col">
      <section className="relative h-[372px] shrink-0 overflow-hidden bg-sage px-7 pt-[84px] text-ink">
        <Logo size={320} decorative className="absolute -right-24 top-[30px]" />
        <h1 className="relative"><Wordmark className="text-[96px]" /></h1>
        <p className="relative mt-3.5 max-w-[170px] font-brand text-lg font-bold leading-snug text-sageink">afford. hang.</p>
      </section>

      <form onSubmit={submit} className="relative z-10 -mt-8 flex flex-1 flex-col gap-3.5 rounded-t-[32px] bg-white px-6 pb-7 pt-7">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-[13px] font-bold text-muted">Email</label>
          <input id="email" className={field} type="email" placeholder="you@school.edu" autoComplete="email" required
            value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pw" className="text-[13px] font-bold text-muted">Password</label>
          <input id="pw" className={field} type="password" placeholder="Password" autoComplete="current-password" required
            value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </div>
        <Err msg={err} />
        <button className="mt-1.5 flex h-14 w-full items-center justify-center rounded-2xl bg-ink text-[17px] font-bold text-white active:opacity-80 disabled:opacity-50" disabled={busy}>Log in</button>
        <button type="button" className="flex h-14 w-full items-center justify-center rounded-2xl bg-mint text-[17px] font-bold text-ink active:opacity-80 disabled:opacity-50" disabled={busy}
          onClick={() => go(() => api("/api/auth/demo", "POST"))}>Continue with demo account</button>
        <p className="mt-auto pt-2 text-center text-[15px] font-semibold text-muted">
          New here? <Link href="/signup" className="font-bold text-wine">Create an account</Link>
        </p>
      </form>
    </main>
  );
}

export function SignupForm() {
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [link, setLink] = useState(true);
  const { err, busy, go } = useAuthSubmit();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    go(async () => {
      await api("/api/auth/signup", "POST", f);
      if (link) await api("/api/bank/link", "POST");
    });
  };

  return (
    <form onSubmit={submit} className="flex min-h-screen flex-col gap-[18px] px-6 pt-14">
      <Link href="/login" aria-label="Back" className="flex h-11 w-11 items-center justify-center rounded-full bg-mint">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
      </Link>

      <div className="flex flex-col gap-1.5">
        <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight">Let&apos;s get you in.</h1>
        <p className="text-base text-muted">Three quick things and you&apos;re planning.</p>
      </div>

      <div className="flex flex-col gap-3">
        <input aria-label="Name" className={field} placeholder="Name" autoComplete="name" required value={f.name} onChange={set("name")} />
        <input aria-label="Email" className={field} type="email" placeholder="Email" autoComplete="email" required value={f.email} onChange={set("email")} />
        <input aria-label="Password" className={field} type="password" placeholder="Password, 8+ characters" autoComplete="new-password" required minLength={8} value={f.password} onChange={set("password")} />
      </div>

      <label className="flex cursor-pointer flex-col gap-3 rounded-[20px] bg-ink p-[18px] text-white">
        <span className="flex items-center justify-between">
          <span className="text-[17px] font-extrabold">Link a bank account</span>
          <span className="rounded-xl bg-peach px-2.5 py-1 text-xs font-extrabold text-ink">DEMO</span>
        </span>
        <span className="text-sm leading-relaxed text-mint">
          WSP reads your spending to find a comfort level for group plans. Friends only see the lowest level in the group, never your purchases.
        </span>
        <span className="flex items-center gap-2.5 rounded-[14px] bg-[#1E4259] px-3.5 py-3">
          <input type="checkbox" checked={link} onChange={(e) => setLink(e.target.checked)} className="h-5 w-5 accent-[var(--peach)]" />
          <span className="text-sm font-semibold">{link ? "Demo checking account selected" : "Skip for now, link it later in Profile"}</span>
        </span>
      </label>

      <Err msg={err} />

      <div className="sticky bottom-0 -mx-6 mt-auto border-t border-line bg-white px-6 pb-[30px] pt-3.5">
        <button className="btn font-extrabold" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
      </div>
    </form>
  );
}
