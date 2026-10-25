"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Logo, Wordmark } from "./Logo";
import { Err } from "./Page";

const field = "h-14 w-full rounded-2xl border-2 border-field bg-white px-4 text-base text-ink outline-none focus:border-ink";

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
      <form onSubmit={submit} className="relative z-10 -mt-8 flex flex-1 flex-col gap-3.5 rounded-t-[32px] bg-white px-6 pb-7 pt-7">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-[13px] font-bold text-muted">Email</label>
          <input id="email" className={field} type="email" placeholder="you@school.edu" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pw" className="text-[13px] font-bold text-muted">Password</label>
          <input id="pw" className={field} type="password" placeholder="Password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
        </div>
        <Err msg={err} />
        <button disabled={busy} className="mt-1.5 flex h-14 w-full items-center justify-center rounded-2xl bg-ink text-[17px] font-bold text-white active:opacity-80 disabled:opacity-50">Log in</button>
        <button type="button" disabled={busy} onClick={() => go(() => api("/api/auth/demo", "POST"))} className="flex h-14 w-full items-center justify-center rounded-2xl bg-mint text-[17px] font-bold text-ink active:opacity-80 disabled:opacity-50">Continue with demo account</button>
        <p className="mt-auto pt-2 text-center text-[15px] font-semibold text-muted">New here? <Link href="/signup" className="font-bold text-wine">Create an account</Link></p>
      </form>
    </main>
  );
}

export function SignupForm() {
  const { err, busy, go } = useAuthSubmit();
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [link, setLink] = useState(true);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    go(async () => {
      await api("/api/auth/signup", "POST", f);
      // TODO(decision): signup links with a default profile; users cannot switch afterwards. Let them pick here too, or link later via the picker.
      if (link) await api("/api/bank/link", "POST", { profile: "average" });
    });
  };
  return (
    <form onSubmit={submit} className="flex min-h-screen flex-col gap-[18px] px-6 pt-14">
      <Link href="/login" aria-label="Back" className="flex h-11 w-11 items-center justify-center rounded-full bg-mint">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
      </Link>
      <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight">Let&apos;s get you in.</h1>
      <p className="text-base text-muted">Three quick things and you&apos;re planning.</p>
      <div className="flex flex-col gap-3">
        <input className={field} aria-label="Name" placeholder="Name" autoComplete="name" value={f.name} onChange={set("name")} required />
        <input className={field} aria-label="Email" type="email" placeholder="Email" autoComplete="email" value={f.email} onChange={set("email")} required />
        <input className={field} aria-label="Password" type="password" placeholder="Password, 8+ characters" autoComplete="new-password" minLength={8} value={f.password} onChange={set("password")} required />
      </div>
      <label className="flex cursor-pointer flex-col gap-3 rounded-[20px] bg-ink p-[18px] text-white">
        <div className="flex items-center justify-between">
          <span className="text-[17px] font-extrabold">Link a bank account</span>
          <span className="rounded-xl bg-peach px-2.5 py-1 text-xs font-extrabold text-ink">DEMO</span>
        </div>
        <p className="text-sm leading-relaxed text-mint">WSP reads your spending to find a comfort level for group plans. Friends only see the lowest level in the group, never your purchases.</p>
        <div className="flex items-center gap-2.5 rounded-[14px] bg-[#1E4259] px-3.5 py-3">
          <input type="checkbox" checked={link} onChange={(e) => setLink(e.target.checked)} className="h-5 w-5 accent-[var(--peach)]" />
          <span className="text-sm font-semibold">{link ? "Demo checking account selected" : "Skip for now, link it later in Profile"}</span>
        </div>
      </label>
      <Err msg={err} />
      <div className="sticky bottom-0 -mx-6 mt-auto border-t border-line bg-white px-6 pb-[30px] pt-3.5">
        <button className="btn font-extrabold" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
      </div>
    </form>
  );
}
