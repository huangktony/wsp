"use client";
import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Page, Err } from "@/components/Page";
import { TierBadge } from "@/components/TierBadge";
import { api, useApi } from "@/lib/client";

// Screen 9: Plans and voting. Approve or veto each plan. Votes are anonymous until voting closes.
type Vote = "approve" | "veto" | null;

function left(ms: number) {
  if (ms <= 0) return "Voting is closing…";
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60);
  return h ? `Voting ends in ${h}h ${m % 60}m` : m ? `Voting ends in ${m}m` : "Voting ends in under a minute";
}

export default function Plans({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const r = useRouter();
  const { data, error, reload } = useApi<any>(`/api/groups/${id}/plans`, 3000);
  const [err, setErr] = useState("");
  const [mine, setMine] = useState<Record<number, Vote>>({}); // optimistic votes
  const [now, setNow] = useState(() => Date.now());

  const deadline = useMemo(() => (data?.round ? Date.now() + data.round.seconds_left * 1000 : 0), [data]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, []);

  const status = data?.round?.status;
  useEffect(() => {
    if (status === "final") r.replace(`/groups/${id}/final`);
    if (status === "vetoed" || status === "generating") r.replace(`/groups/${id}/finding`);
  }, [status, id, r]);

  if (!data) return <Page back={`/groups/${id}`}>{error || "Loading…"}</Page>;
  if (!data.round || status !== "voting") return <Page back={`/groups/${id}`}>{data.round ? "Loading…" : "No plans yet."}</Page>;

  const voteOf = (p: any): Vote => (p.id in mine ? mine[p.id] : p.my_vote ?? null);
  const vote = (p: any, v: Exclude<Vote, null>) => {
    const next = voteOf(p) === v ? null : v; // tap again to undo
    setMine((m) => ({ ...m, [p.id]: next }));
    setErr("");
    api(`/api/plans/${p.id}/vote`, "POST", { value: next })
      .then(reload)
      .catch((e) => { setErr(e.message); setMine((m) => { const { [p.id]: _, ...rest } = m; return rest; }); });
  };
  const close = () => api(`/api/groups/${id}/final`, "POST").then(reload).catch((e) => setErr(e.message));
  const myCount = data.plans.filter((p: any) => voteOf(p)).length;

  return (
    <Page back={`/groups/${id}`}>
      <p className="text-sm font-semibold text-muted">{data.group.name}{data.round.attempt > 1 && ` · Round ${data.round.attempt}`}</p>
      <h1 className="mb-3 text-3xl font-bold">{data.plans.length} plans for {data.round.slot}</h1>
      <div className="mb-5 flex flex-wrap gap-2">
        <span className="chip-pink">{left(deadline - now)}</span>
        <span className="chip">{data.voted} of {data.memberCount} voted</span>
        <TierBadge tier={data.round.group_tier} label="Group budget" />
      </div>

      <div className="space-y-4">
        {data.plans.map((p: any) => {
          const v = voteOf(p);
          return (
            <article key={p.id} className={`card ${v === "approve" ? "border-2 border-sage" : v === "veto" ? "border-2 border-deep" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-xl font-bold">{p.title}</h2>
                <span className="whitespace-nowrap font-bold text-sageink">~${Math.round(p.cost)} each</span>
              </div>
              <p className="mt-1 text-sm text-muted">{data.round.slot} · {p.stops.length} {p.stops.length === 1 ? "stop" : "stops"} · {p.price_level}</p>
              <ol className="my-3 space-y-1 text-sm">
                {p.stops.map((s: any, i: number) => <li key={i}><b>{s.time}</b> · {s.place}</li>)}
              </ol>
              <p className="text-sm"><b>Why:</b> {p.why_fits}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button aria-pressed={v === "approve"} onClick={() => vote(p, "approve")}
                  className={`h-12 rounded-2xl font-semibold ${v === "approve" ? "bg-sage text-sageink" : "border border-line"}`}>✓ Approve</button>
                <button aria-pressed={v === "veto"} onClick={() => vote(p, "veto")}
                  className={`h-12 rounded-2xl font-semibold ${v === "veto" ? "bg-deep text-white" : "border border-line"}`}>✕ Veto</button>
              </div>
            </article>
          );
        })}
      </div>

      <Err msg={err} />
      <p className="mt-5 text-center text-sm text-muted">
        {myCount < data.plans.length ? `Vote on all ${data.plans.length} to count as voted. ` : "You're done. "}
        Votes are anonymous until the end. Voting closes at the deadline or once everyone has voted.
      </p>
      {data.isCreator && <button className="btn-ghost mt-4" onClick={close}>Close voting now</button>}
    </Page>
  );
}
