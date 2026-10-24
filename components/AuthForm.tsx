"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Logo } from "./Logo";
import { Err } from "./Page";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const r = useRouter();
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [link, setLink] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function go(fn: () => Promise<unknown>) {
    setBusy(true); setErr("");
    try { await fn(); r.push("/groups"); r.refresh(); } catch (e: any) { setErr(e.message); setBusy(false); }
  }
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    go(async () => {
      await api(`/api/auth/${mode}`, "POST", f);
      if (mode === "signup" && link) await api("/api/bank/link", "POST");
    });
  };
  return (
    <main className="px-5 pt-12 pb-10">
      <div className="mb-6 flex flex-col items-center gap-2"><Logo size={72} /><h1 className="text-4xl font-bold">WSP</h1><p className="text-muted">Hangouts everyone can afford</p></div>
      <form onSubmit={submit} className="space-y-3">
        {mode === "signup" && <input className="input" placeholder="Name" value={f.name} onChange={set("name")} required />}
        <input className="input" type="email" placeholder="Email" value={f.email} onChange={set("email")} required />
        <input className="input" type="password" placeholder="Password" value={f.password} onChange={set("password")} required minLength={6} />
        {mode === "signup" && (
          <label className="card flex items-center gap-3">
            <input type="checkbox" checked={link} onChange={(e) => setLink(e.target.checked)} className="h-5 w-5 accent-[var(--sage)]" />
            <span><b>Link a bank account</b><br /><span className="text-sm text-muted">Demo account via Capital One Nessie. Friends never see your purchases.</span></span>
          </label>
        )}
        <Err msg={err} />
        <button className="btn" disabled={busy}>{mode === "login" ? "Log in" : "Create account"}</button>
      </form>
      {mode === "login" && <button className="btn-ghost mt-3" disabled={busy} onClick={() => go(() => api("/api/auth/demo", "POST"))}>Continue with demo account</button>}
      <p className="mt-6 text-center text-sm text-muted">
        {mode === "login" ? <>New here? <Link href="/signup" className="font-bold text-ink">Sign up</Link></> : <>Have an account? <Link href="/login" className="font-bold text-ink">Log in</Link></>}
      </p>
    </main>
  );
}
