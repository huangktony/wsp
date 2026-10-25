"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Inter } from "next/font/google";
import { Avatar } from "@/components/Avatar";
import { Page } from "@/components/Page";
import { TierBadge } from "@/components/TierBadge";
import { api, INTERESTS, toggle, useApi } from "@/lib/client";
import { resizeAvatar } from "@/lib/image";

const inter = Inter({ subsets: ["latin"], weight: ["400", "600", "700", "800"] });
const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo";
const pill = `flex min-h-11 items-center justify-center rounded-full border border-line px-4 text-sm font-semibold ${focus}`;
const icon = `flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-mint ${focus}`;

export default function Profile() {
  const { data, error, reload } = useApi<any>("/api/me");
  const [it, setIt] = useState<string[]>([]), [mi, setMi] = useState(10), [status, setStatus] = useState<"" | "saving" | "saved">("");
  const dirty = useRef(false);
  const [menu, setMenu] = useState(false), [editing, setEditing] = useState(false), [draft, setDraft] = useState("");
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { if (data && !dirty.current) { setIt(data.interests); setMi(data.max_distance_mi); } }, [data]);
  // Interests and distance save themselves shortly after the last change.
  useEffect(() => {
    if (!dirty.current) return;
    setStatus("saving");
    const t = setTimeout(() => {
      api("/api/me", "PUT", { interests: it, max_distance_mi: mi })
        .then(() => setStatus("saved"))
        .catch((e) => { setStatus(""); setErr(e.message); });
    }, 500);
    return () => clearTimeout(t);
  }, [it, mi]);
  const edit = (fn: () => void) => { dirty.current = true; setErr(""); fn(); };

  const patch = async (body: { name?: string; avatar?: string | null }) => {
    setBusy(true); setErr("");
    try { await api("/api/me/profile", "PATCH", body); await reload(); return true; }
    catch (e: any) { setErr(e.message); return false; }
    finally { setBusy(false); }
  };
  const saveName = async () => {
    const name = draft.trim();
    if (!name) return setErr("Name can't be empty.");
    if (await patch({ name })) setEditing(false);
  };
  const pick = async (f?: File) => {
    if (!f) return;
    setMenu(false);
    try { await patch({ avatar: await resizeAvatar(f) }); } catch (e: any) { setErr(e.message); }
  };

  if (!data) return <Page variant="plain" tabs><p className="px-6 pt-6" role={error ? "alert" : "status"}>{error || "Loading…"}</p></Page>;
  const linked = !!data.nessie_account_id;
  const row = "flex min-h-14 items-center justify-between gap-3 px-4 py-3";
  return (
    <Page variant="plain" tabs>
      <div className={`${inter.className} bg-surface px-6 pt-6 text-indigo`}>
      <header className="mb-5 flex items-center justify-between">
        <h1 className="font-[inherit] text-[36px] font-extrabold leading-tight tracking-[-1.4px]">Profile</h1>
        <Link href="/settings" aria-label="Settings" className={icon}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
        </Link>
      </header>

      <div className="space-y-5">
        <div className="flex items-center gap-4 text-indigo">
          <div className="relative shrink-0">
            <button type="button" aria-label="Profile photo options" aria-expanded={menu} onClick={() => setMenu(!menu)} className={`rounded-full ${focus}`}>
              <Avatar name={data.name} src={data.avatar} className="h-16 w-16 bg-orchid text-2xl text-orchidink" />
            </button>
            {menu && <div role="menu" className="absolute left-0 top-[72px] z-10 flex w-44 flex-col gap-1 rounded-2xl border border-line bg-surface p-2 shadow-lg">
              <button role="menuitem" type="button" className={pill} onClick={() => file.current?.click()}>{data.avatar ? "Change photo" : "Upload photo"}</button>
              {data.avatar && <button role="menuitem" type="button" className={`${pill} text-maroon`} onClick={() => { setMenu(false); patch({ avatar: null }); }}>Remove photo</button>}
            </div>}
            <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
          <div className="min-w-0 flex-1">
            {editing ? (
              <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); saveName(); }}>
                <input autoFocus aria-label="Name" value={draft} maxLength={60} onChange={(e) => setDraft(e.target.value)} className="h-11 min-w-0 flex-1 rounded-full border border-line bg-surface px-4 text-ink" />
                <button type="submit" disabled={busy} className={`${pill} border-matcha bg-matcha text-matchaink`}>Save</button>
                <button type="button" onClick={() => { setEditing(false); setErr(""); }} className={pill}>Cancel</button>
              </form>
            ) : (
              <div className="flex items-center gap-1">
                <h2 className="min-w-0 break-words font-[inherit] text-xl font-extrabold">{data.name}</h2>
                <button type="button" aria-label="Edit name" onClick={() => { setDraft(data.name); setEditing(true); setErr(""); }} className={icon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                </button>
              </div>
            )}
            <p className="truncate text-sm text-secondary">{data.email}</p>
          </div>
        </div>
        {err && <p role="alert" className="text-sm font-semibold text-maroon">{err}</p>}

        <section className="divide-y divide-azure overflow-hidden rounded-2xl border border-azure bg-pistachio">
          <div className={row}><span className="font-semibold">Bank account</span>{linked ? <span className="font-semibold">Linked ✓</span> : <Link href="/spending" className="font-semibold underline">Link bank</Link>}</div>
          <div className={row}><span className="font-semibold">Comfort level</span><span className="rounded-full bg-surface"><TierBadge tier={data.budget_tier} /></span></div>
          <div className="px-4 py-3"><span className="label text-secondary">Usual interests</span><div className="flex flex-wrap gap-2">
            {INTERESTS.map((s) => <button key={s} type="button" aria-pressed={it.includes(s)} onClick={() => edit(() => setIt(toggle(it, s)))} className={`rounded-full border px-4 py-2 text-sm font-semibold capitalize ${focus} ${it.includes(s) ? "border-matcha bg-matcha text-matchaink" : "border-outline"}`}>{s}</button>)}
          </div></div>
          <div className="px-4 py-3"><label className="label text-secondary" htmlFor="max-distance">Max distance: {mi} mi</label><input id="max-distance" type="range" min={1} max={30} value={mi} onChange={(e) => edit(() => setMi(+e.target.value))} className="range-wsp w-full" style={{ "--fill": `${(mi - 1) / 29 * 100}%` } as React.CSSProperties} /></div>
        </section>

        <p className="rounded-2xl border border-dashed border-outline p-4 text-sm text-secondary"><span className="font-bold text-indigo">Your privacy.</span> Friends only see the lowest comfort level in a group. Your balance and purchases stay private.</p>

        <p role="status" aria-live="polite" className="h-5 text-center text-sm text-secondary">{status === "saving" ? "Saving…" : status === "saved" ? "Saved ✓" : ""}</p>
      </div>
      </div>
    </Page>
  );
}
