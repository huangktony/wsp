"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Page } from "@/components/Page";
import { api, INTERESTS, toggle, useApi } from "@/lib/client";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Row({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-3.5 ${last ? "" : "border-b border-line"}`}>
      <span className="text-[15px] font-semibold">{label}</span>
      <span className="text-sm text-muted">{children}</span>
    </div>
  );
}

export default function Profile() {
  const r = useRouter();
  const { data, reload } = useApi<any>("/api/me");
  const [it, setIt] = useState<string[]>([]), [mi, setMi] = useState(10);
  const [editing, setEditing] = useState(false), [busy, setBusy] = useState(false);
  useEffect(() => { if (data) { setIt(data.interests); setMi(data.max_distance_mi); } }, [data]);
  if (!data) return <Page title="Profile" tabs>Loading…</Page>;

  const save = async () => { setBusy(true); await api("/api/me", "PUT", { interests: it, max_distance_mi: mi }); await reload(); setBusy(false); setEditing(false); };
  const linkBank = async () => { setBusy(true); await api("/api/bank/link", "POST"); await reload(); setBusy(false); };
  const logout = () => api("/api/auth/logout", "POST").then(() => { r.push("/login"); r.refresh(); });

  return (
    <Page title="Profile" tabs>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3.5">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sage text-[26px] font-extrabold text-sageink" aria-hidden="true">
            {data.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xl font-extrabold">{data.name}</span>
            <span className="text-sm text-muted">{data.email}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-mint px-4 py-1">
          <Row label="Bank account">
            {data.nessie_account_id ? "Demo account linked" : (
              <button onClick={linkBank} disabled={busy} className="font-bold text-wine">Link demo account</button>
            )}
          </Row>
          <Row label="Comfort level"><span className="text-[15px] font-extrabold text-ink">{data.budget_tier ?? "–"}</span></Row>
          <Row label="Usual interests">{data.interests.length ? data.interests.map(cap).join(", ") : "None yet"}</Row>
          <Row label="Max distance" last>{data.max_distance_mi} mi</Row>
        </div>

        {editing ? (
          <div className="flex flex-col gap-4 rounded-2xl border border-line p-4">
            <section>
              <span className="label">Interests</span>
              <div className="flex flex-wrap gap-2">
                {INTERESTS.map((s) => (
                  <button key={s} onClick={() => setIt(toggle(it, s))} aria-pressed={it.includes(s)}
                    className={`rounded-full border px-4 py-2 text-sm font-semibold capitalize ${it.includes(s) ? "border-sage bg-sage text-sageink" : "border-line"}`}>{s}</button>
                ))}
              </div>
            </section>
            <section>
              <label htmlFor="dist" className="label">Max distance: {mi} mi</label>
              <input id="dist" type="range" min={1} max={30} value={mi} onChange={(e) => setMi(+e.target.value)} className="w-full accent-[var(--sage)]" />
            </section>
            <button className="btn" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="self-start text-sm font-bold text-wine">Edit interests and distance</button>
        )}

        <div className="flex flex-col gap-1.5 rounded-2xl border-[1.5px] border-dashed border-field p-4">
          <span className="text-[15px] font-bold">Your privacy</span>
          <span className="text-sm leading-relaxed text-muted">Friends only see the lowest comfort level in a group. Your balance and purchases stay private.</span>
        </div>

        <button onClick={logout} className="flex h-[50px] w-full items-center justify-center rounded-[14px] border border-field text-base font-semibold text-ink active:opacity-80">Log out</button>
      </div>
    </Page>
  );
}
