"use client";
import { useEffect, useState } from "react";
import { Page } from "@/components/Page";
import { getThemePref, setThemePref, type ThemePref } from "@/lib/theme";

const THEMES: { value: ThemePref; label: string; hint: string }[] = [
  { value: "system", label: "System", hint: "Match your device" },
  { value: "light", label: "Light", hint: "Always light" },
  { value: "dark", label: "Dark", hint: "Always dark" },
];

export default function Settings() {
  const [theme, setTheme] = useState<ThemePref | null>(null);
  useEffect(() => setTheme(getThemePref()), []);
  const choose = (t: ThemePref) => { setTheme(t); setThemePref(t); };
  return (
    <Page title="Settings" back="/profile" tabs>
      <section>
        <span id="appearance" className="label">Appearance</span>
        <div role="radiogroup" aria-labelledby="appearance" className="card divide-y divide-line p-0">
          {THEMES.map((t) => (
            <label key={t.value} className="flex min-h-14 cursor-pointer items-center justify-between gap-3 px-4 py-3">
              <span>
                <span className="block font-semibold">{t.label}</span>
                <span className="block text-sm text-muted">{t.hint}</span>
              </span>
              <input type="radio" name="theme" value={t.value} checked={theme === t.value} onChange={() => choose(t.value)} className="h-5 w-5 accent-[var(--sage)]" />
            </label>
          ))}
        </div>
      </section>
    </Page>
  );
}
