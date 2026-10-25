"use client";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Page, Err } from "@/components/Page";
import { api } from "@/lib/client";

// Screen 8: Finding plans. Also the "all vetoed, making new ones" screen.
const STEPS = [
  ["Matching everyone's free time", "Picking the slot most of you share"],
  ["Checking the group budget", "Using the lowest level in the group"],
  ["Searching nearby places", "Skipping anything above budget"],
  ["Writing the plans", "With a reason for each"],
];
const MIN_MS = 3800; // so the checklist is readable even when mocks answer instantly
const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

export default function Finding({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const r = useRouter();
  const [step, setStep] = useState(0), [err, setErr] = useState("");
  const [prev, setPrev] = useState<{ group?: string; vetoed?: string[]; titles?: string[] } | null>(null);
  const started = useRef(false);

  const run = useCallback(async () => {
    setErr(""); setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 900);
    const t0 = Date.now();
    try {
      const before = await api<any>(`/api/groups/${id}/plans`);
      setPrev({ group: before.group?.name, vetoed: before.round?.status === "vetoed" ? before.round.excluded : undefined, titles: before.plans?.map((p: any) => p.title) });
      if (before.round?.status === "voting") return r.replace(`/groups/${id}/plans`);
      const res = await api<any>(`/api/groups/${id}/plans`, "POST");
      // Someone else in the group already started the search: wait for it instead of making a second round.
      let status = res.status;
      while (status === "generating") {
        await sleep(1500);
        status = (await api<any>(`/api/groups/${id}/plans`)).round?.status;
      }
      await sleep(Math.max(0, MIN_MS - (Date.now() - t0)));
      r.replace(`/groups/${id}/plans`);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      clearInterval(t);
    }
  }, [id, r]);

  useEffect(() => {
    if (started.current) return; // dev mode runs effects twice
    started.current = true;
    run();
  }, [run]);

  const regen = !!prev?.vetoed;
  return (
    <Page back={`/groups/${id}`}>
      <div className="text-center">
        <div className={err ? "inline-block" : "inline-block animate-bounce"}><Logo size={80} /></div>
        <h1 className="mt-4 text-3xl font-bold">{regen ? (prev?.titles?.length === 1 ? "The plan was vetoed" : `All ${prev?.titles?.length ?? 3} plans were vetoed`) : "Finding plans…"}</h1>
        {regen && <p className="mt-2 text-muted">No problem. We're making new ones and leaving out those places.</p>}
      </div>

      <ol className="card mt-6 space-y-4">
        {STEPS.map(([name, detail], i) => {
          const done = i < step;
          const active = i === step && !err;
          return (
            <li key={name} className={`flex items-center gap-3 ${i > step ? "opacity-40" : ""}`}>
              <span aria-hidden className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${done ? "bg-sage text-sageink" : active ? "border-[3px] border-sage" : "border-2 border-line"}`}>{done ? "✓" : ""}</span>
              <span>
                <span className={`block ${i > step ? "" : "font-semibold"}`}>{name}</span>
                <span className="block text-sm text-muted">{detail}</span>
              </span>
            </li>
          );
        })}
      </ol>

      {regen && prev!.vetoed!.length > 0 && (
        <div className="mt-5">
          <p className="label">Left out this time</p>
          <div className="flex flex-wrap gap-2">
            {prev!.vetoed!.map((p) => <span key={p} className="rounded-full border border-line px-3 py-1 text-sm text-muted line-through">{p}</span>)}
          </div>
        </div>
      )}

      <Err msg={err} />
      {err && <button className="btn mt-4" onClick={run}>Try again</button>}
      {regen && !err && <p className="mt-6 text-center text-sm text-muted">The voting deadline resets once new plans are ready.</p>}
    </Page>
  );
}
