"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Inter } from "next/font/google";
import { Avatar } from "@/components/Avatar";
import { Page } from "@/components/Page";
import { Skeleton, SkeletonBlock } from "@/components/Skeleton";
import { api, useApi } from "@/lib/client";
import { resizeAvatar } from "@/lib/image";
import { getThemePref, setThemePref, type ThemePref } from "@/lib/theme";

const inter = Inter({ subsets: ["latin"], weight: ["400", "600", "700", "800"] });
const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo";
const pill = `flex min-h-11 items-center justify-center rounded-full border border-line px-4 text-sm font-semibold ${focus}`;
const icon = `flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-mint ${focus}`;
const card = "divide-y divide-azure overflow-hidden rounded-2xl border border-azure bg-pistachio";
const row = "flex min-h-14 items-center justify-between gap-3 px-4 py-3";
const THEMES: { value: ThemePref; label: string }[] = [{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }];

/** The account stores one name; the first word is the first name and the rest is the last name. */
function splitName(name: string) {
  const [first = "", ...rest] = name.trim().split(/\s+/);
  return { first, last: rest.join(" ") };
}

const Pencil = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
);

export default function Profile() {
  const r = useRouter();
  const { data, error, reload } = useApi<any>("/api/me");
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState<"" | "first" | "last">("");
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState<ThemePref | null>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => setTheme(getThemePref()), []);

  const patch = async (body: { name?: string; avatar?: string | null }) => {
    setBusy(true);
    setErr("");
    try {
      await api("/api/me/profile", "PATCH", body);
      await reload();
      return true;
    } catch (e: any) {
      setErr(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (field: "first" | "last") => {
    setDraft(splitName(data.name)[field]);
    setEditing(field);
    setErr("");
  };

  const saveName = async () => {
    const value = draft.trim();
    const { first, last } = splitName(data.name);
    if (editing === "first" && !value) return setErr("First name can't be empty.");
    if (editing === "first" && /\s/.test(value)) return setErr("First name should be one word.");
    const name = editing === "first" ? `${value} ${last}` : `${first} ${value}`;
    if (await patch({ name: name.trim() })) setEditing("");
  };

  const pick = async (f?: File) => {
    if (!f) return;
    setMenu(false);
    try {
      await patch({ avatar: await resizeAvatar(f) });
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const chooseTheme = (t: ThemePref) => { setTheme(t); setThemePref(t); };

  const logOut = () => api("/api/auth/logout", "POST").then(() => { r.push("/login"); r.refresh(); });

  if (!data) return (
    <Page variant="plain">
      <div className={`${inter.className} px-6 pt-6 text-indigo`}>
        {error ? <p role="alert" className="text-sm font-semibold text-maroon">{error}</p> : (
          <Skeleton>
            <SkeletonBlock className="mb-4 h-9 w-1/2" />
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <SkeletonBlock className="h-16 w-16 !rounded-full" />
                <SkeletonBlock className="h-6 w-40" />
              </div>
              <SkeletonBlock className="h-56" />
              <SkeletonBlock className="h-24" />
              <SkeletonBlock className="h-14" />
            </div>
          </Skeleton>
        )}
      </div>
    </Page>
  );

  const { first, last } = splitName(data.name);
  const nameRow = (field: "first" | "last", label: string, value: string) => (
    <div className={row}>
      {editing === field ? (
        <form className="flex w-full items-center gap-2" onSubmit={(e) => { e.preventDefault(); saveName(); }}>
          <input autoFocus aria-label={label} value={draft} maxLength={40} onChange={(e) => setDraft(e.target.value)} className="h-11 min-w-0 flex-1 rounded-full border border-line bg-surface px-4 text-ink" />
          <button type="submit" disabled={busy} className={`${pill} border-matcha bg-matcha text-matchaink`}>Save</button>
          <button type="button" onClick={() => { setEditing(""); setErr(""); }} className={pill}>Cancel</button>
        </form>
      ) : (
        <>
          <div className="min-w-0">
            <span className="block text-sm text-secondary">{label}</span>
            <span className="block break-words font-semibold">{value || "—"}</span>
          </div>
          <button type="button" aria-label={`Edit ${label.toLowerCase()}`} onClick={() => startEdit(field)} className={icon}><Pencil /></button>
        </>
      )}
    </div>
  );

  return (
    <Page variant="plain">
      <div className={`${inter.className} px-6 pt-6 text-indigo`}>
        <h1 className="mb-5 font-[inherit] text-[36px] font-extrabold leading-tight tracking-[-1.4px]">Profile</h1>

        <div className="space-y-5">
          <div className="glass flex items-center gap-4 !p-3 text-indigo">
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
            <h2 className="min-w-0 break-words font-[inherit] text-xl font-extrabold">{data.name}</h2>
          </div>
          {err && <p role="alert" className="text-sm font-semibold text-maroon">{err}</p>}

          <section aria-labelledby="account-info">
            <h3 id="account-info" className="label font-[inherit] !text-lg text-secondary">Account information</h3>
            <div className={card}>
              {nameRow("first", "First name", first)}
              {nameRow("last", "Last name", last)}
              <div className={row}>
                <div className="min-w-0">
                  <span className="block text-sm text-secondary">Email</span>
                  <span className="block truncate font-semibold">{data.email}</span>
                </div>
              </div>
              <div className={row}>
                <div className="min-w-0">
                  <span className="block text-sm text-secondary">Password</span>
                  <span className="block font-semibold tracking-widest" aria-label="Password hidden">••••••••</span>
                </div>
              </div>
            </div>
          </section>

          <section aria-labelledby="account-settings">
            <h3 id="account-settings" className="label font-[inherit] !text-lg text-secondary">Account settings</h3>
            <div className={card}>
              <div className="px-4 py-3">
                <span id="theme" className="mb-2 block text-sm text-secondary">Theme</span>
                <div role="radiogroup" aria-labelledby="theme" className="flex gap-1 rounded-full border border-line bg-surface p-1">
                  {THEMES.map((t) => (
                    <button key={t.value} type="button" role="radio" aria-checked={theme === t.value} onClick={() => chooseTheme(t.value)} className={`min-h-11 flex-1 rounded-full text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo ${theme === t.value ? "bg-sage text-sageink" : "text-ink"}`}>{t.label}</button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <button type="button" className={`flex h-14 w-full items-center justify-center rounded-full border border-line bg-surface text-base font-semibold text-maroon active:opacity-80 ${focus}`} onClick={logOut}>Log off</button>
          <div className="h-24" aria-hidden="true" />
        </div>
      </div>
    </Page>
  );
}
