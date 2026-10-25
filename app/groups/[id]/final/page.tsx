"use client";
import Link from "next/link";
import { use, useState } from "react";
import { Page, Err } from "@/components/Page";
import { api, useApi } from "@/lib/client";
import { slotDate, slotLabel } from "@/lib/slot";
import { splitAmounts, type SplitMode } from "@/lib/split";

// Screen 10: Final plan and split. Itinerary -> split (even / by item) -> payment requests -> hangout confirmed.
const money = (n: number | null | undefined) => `$${(Number(n) || 0).toFixed(2)}`;

function downloadIcs(title: string, slot: string, from: string, stops: any[]) {
  const { start, end } = slotDate(slot, from);
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const desc = stops.map((s) => `${s.time} ${s.place}`).join("\\n");
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//WSP//EN", "BEGIN:VEVENT", `UID:${Date.now()}@wsp`, `DTSTAMP:${f(new Date())}`,
    `DTSTART:${f(start)}`, `DTEND:${f(end)}`, `SUMMARY:${title}`, `LOCATION:${stops[0]?.address ?? stops[0]?.place ?? ""}`, `DESCRIPTION:${desc}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  a.download = "hangout.ics";
  a.click();
}

export default function Final({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, reload } = useApi<any>(`/api/groups/${id}/plans`, 4000);
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  // The change being saved, shown right away instead of waiting for the server and the reload.
  const [draft, setDraft] = useState<{ mode?: SplitMode; skips?: number[] } | null>(null);
  const plan = data?.plans?.find((p: any) => p.id === data.round?.winner_plan_id);
  if (!data || !plan || !data.split) return <Page back={`/groups/${id}`}>{error || (data && data.round?.status !== "final" ? "No final plan yet." : "Loading…")}</Page>;

  const { round, payments } = data;
  const split = draft
    ? { ...data.split, mode: draft.mode ?? data.split.mode, ...splitAmounts(plan.stops.map((s: any) => s.cost),
        data.split.rows.map((x: any) => (x.user_id === data.me && draft.skips ? { ...x, skips: draft.skips } : x)), draft.mode ?? data.split.mode) }
    : data.split;
  const act = (body: any, next: typeof draft) => {
    setBusy(true); setErr(""); setDraft(next);
    return api(`/api/groups/${id}/split`, "POST", body).then(reload).catch((e) => setErr(e.message)).finally(() => { setDraft(null); setBusy(false); });
  };
  const me = split.rows.find((x: any) => x.user_id === data.me);
  const payer = split.rows.find((x: any) => x.user_id === split.payerId);
  const others = split.rows.filter((x: any) => x.user_id !== split.payerId && x.amount > 0);
  const going = split.rows.filter((x: any) => x.going).length;
  const sent = round.requests_sent;
  const myPayment = payments.find((p: any) => p.user_id === data.me);
  const paid = payments.filter((p: any) => p.status === "paid");
  const pending = payments.filter((p: any) => p.status === "owed").reduce((a: number, p: any) => a + p.amount, 0);
  const maps = `https://www.google.com/maps/dir/${plan.stops.map((s: any) => encodeURIComponent(s.address ? `${s.place}, ${s.address}` : s.place)).join("/")}`;

  return (
    <Page back={`/groups/${id}`}>
      {sent ? (
        <div className="mb-5 text-center">
          <div aria-hidden className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-sage text-4xl text-sageink">✓</div>
          <h1 className="mt-3 text-3xl font-bold">Hangout confirmed</h1>
          <p className="text-muted">Everyone has the plan and their payment request.</p>
        </div>
      ) : (
        <div><span className="chip">Winner · {plan.approve} of {data.memberCount} approved</span></div>
      )}

      <h2 className={`${sent ? "text-xl" : "mt-2 text-3xl"} font-bold`}>{plan.title}</h2>
      <p className="mb-4 text-muted">{slotLabel(round.slot, round.created_at)}</p>

      {/* Itinerary */}
      <ol className="card mb-3">
        {plan.stops.map((s: any, i: number) => {
          const skipping = me?.skips.includes(i);
          return (
            <li key={i} className="flex gap-3">
              <div className="flex w-16 shrink-0 flex-col items-center">
                <span className="text-xs font-bold">{s.time}</span>
                {i < plan.stops.length - 1 && <span className="mt-1 w-0.5 flex-1 bg-line" />}
              </div>
              <div className={`flex-1 pb-4 ${skipping ? "opacity-50" : ""}`}>
                <p className="font-bold">{s.place}</p>
                {s.address && <p className="text-sm text-muted">{s.address}</p>}
                <p className="text-sm font-semibold text-sageink">~${Number.isInteger(s.cost) ? s.cost : Number(s.cost).toFixed(2)} each</p>
                {!sent && plan.stops.length > 1 && (
                  <label className="mt-1 flex items-center gap-2 text-sm text-muted">
                    <input type="checkbox" className="h-4 w-4" checked={!!skipping} disabled={busy} onChange={(e) => act({ action: "skip", stop: i, skip: e.target.checked }, { skips: e.target.checked ? [...me.skips, i] : me.skips.filter((k: number) => k !== i) })} />
                    I'll skip this stop
                  </label>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mb-6 grid grid-cols-2 gap-2">
        <button className="btn-ghost" onClick={() => downloadIcs(plan.title, round.slot, round.created_at, plan.stops)}>Add to calendar</button>
        <a className="btn-ghost" href={maps} target="_blank" rel="noreferrer">Get directions</a>
      </div>

      {/* Split */}
      <section className="rounded-card bg-panel p-5 text-white">
        <p className="text-sm opacity-80">Estimated total · {going} going</p>
        <p className="font-display text-4xl font-bold">{money(split.total)}</p>
        <p className="text-sm opacity-80">{payer?.user_id === data.me ? "You pay" : `${payer?.name ?? "The organizer"} pays`} up front, everyone pays back via Nessie.</p>
      </section>

      {!sent && (
        <div role="group" aria-label="Split method" className="my-3 grid grid-cols-2 gap-1 rounded-2xl border border-line bg-mintsoft p-1">
          {([["even", "Split evenly"], ["items", "By item"]] as const).map(([m, label]) => (
            <button key={m} aria-pressed={split.mode === m} disabled={!data.isPayer || busy} onClick={() => split.mode !== m && act({ action: "mode", mode: m }, { mode: m })}
              className={`h-11 rounded-xl text-sm transition-colors ${split.mode === m ? "bg-sage font-bold text-sageink shadow-md" : "font-semibold text-muted"} ${!data.isPayer ? "cursor-default" : ""}`}>
              {split.mode === m && <span aria-hidden>✓ </span>}{label}
            </button>
          ))}
        </div>
      )}
      {!sent && <p className="mb-3 text-xs text-muted">{split.mode === "even" ? "Everyone going pays the same." : "You only pay for the stops you go to."}</p>}

      <ul className="card mt-3 divide-y divide-line p-0">
        {split.rows.map((x: any) => {
          const pay = payments.find((p: any) => p.user_id === x.user_id);
          const note = x.user_id === split.payerId ? "Paying up front"
            : !x.going ? "Not going"
            : x.skips.length ? `Skipping ${x.skips.map((i: number) => plan.stops[i]?.place).join(", ")}`
            : sent ? "" : "Request";
          return (
            <li key={x.user_id} className="flex items-center gap-3 px-4 py-3">
              <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-mint text-xs font-bold text-sageink">{x.name.split(/\s+/).map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}</span>
              <span className="flex-1">
                <span className="block font-semibold">{x.name}{x.user_id === data.me && " (you)"}</span>
                {note && <span className="block text-xs text-muted">{note}</span>}
              </span>
              <span className="font-bold">{money(x.amount)}</span>
              {pay && <span className={pay.status === "paid" ? "chip" : "chip-pink"}>{pay.status === "paid" ? "PAID" : "OWED"}</span>}
            </li>
          );
        })}
      </ul>

      <Err msg={err} />
      <div className="mt-5 space-y-3">
        {!sent && data.isPayer && (
          <button className="btn" disabled={busy || !others.length} onClick={() => act({ action: "send" }, null)}>
            Send {others.length} {others.length === 1 ? "request" : "requests"} via Nessie
          </button>
        )}
        {!sent && !data.isPayer && <p className="text-center text-sm text-muted">Waiting for {payer?.name ?? "the organizer"} to send payment requests. You can still mark stops you'll skip.</p>}
        {sent && (
          <p className="text-center text-sm font-semibold">Paid back {paid.length} of {payments.length}{pending > 0 && ` · ${money(pending)} pending`}</p>
        )}
        {sent && myPayment?.status === "owed" && (
          <button className="btn" disabled={busy} onClick={() => { setBusy(true); api(`/api/payments/${myPayment.id}/mark-paid`, "POST").then(reload).catch((e) => setErr(e.message)).finally(() => setBusy(false)); }}>
            Pay {payer?.name} back {money(myPayment.amount)}
          </button>
        )}
        {sent && <Link href="/groups" className="btn-ghost">Back to groups</Link>}
      </div>
      <p className="mt-3 text-center text-xs text-muted">Demo only. No real money moves.</p>
    </Page>
  );
}
