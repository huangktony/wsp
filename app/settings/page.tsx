"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Inter } from "next/font/google";
import { BackButton } from "@/components/BackButton";
import { Page } from "@/components/Page";
import { api } from "@/lib/client";
import { getThemePref, resolvedTheme, setThemePref } from "@/lib/theme";

const inter = Inter({ subsets: ["latin"], weight: ["400", "600", "700", "800"] });
const THEMES = [{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }] as const;
type Theme = (typeof THEMES)[number]["value"];

export default function Settings() {
  const r = useRouter();
  const [theme, setTheme] = useState<Theme | null>(null);
  // No saved choice yet means the OS decided; show what is actually applied.
  useEffect(() => { const p = getThemePref(); setTheme(p === "system" ? resolvedTheme() : p); }, []);
  const choose = (t: Theme) => { setTheme(t); setThemePref(t); };
  return (
    <Page variant="plain">
      <div className={`${inter.className} px-6 pt-6 text-indigo`}>
      <BackButton href="/profile" className="mb-3" />
      <h1 className="mb-4 font-[inherit] text-[36px] font-extrabold leading-tight tracking-[-1.4px]">Settings</h1>
      <section>
        <span id="appearance" className="label">Appearance</span>
        <div role="radiogroup" aria-labelledby="appearance" className="flex gap-1 rounded-full border border-line bg-surface p-1">
          {THEMES.map((t) => (
            <button key={t.value} type="button" role="radio" aria-checked={theme === t.value} onClick={() => choose(t.value)} className={`min-h-11 flex-1 rounded-full text-base font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo ${theme === t.value ? "bg-sage text-sageink" : "text-ink"}`}>{t.label}</button>
          ))}
        </div>
      </section>
      <button type="button" className="mt-10 flex h-14 w-full items-center justify-center rounded-full border border-line bg-surface text-base font-semibold text-ink active:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo" onClick={() => api("/api/auth/logout", "POST").then(() => { r.push("/login"); r.refresh(); })}>Log out</button>
      </div>
    </Page>
  );
}
