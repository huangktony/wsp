"use client";
import { availabilityLabel } from "@/lib/availability";
import { TimeNotice } from "@/components/TimeNotice";
import { groupHref, SETUP_REQUIRED_MESSAGE } from "@/lib/finding";
import { RedrawVote } from "@/components/RedrawVote";
import Link from "next/link";
import { Inter } from "next/font/google";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Smiley } from "@/components/Smiley";
import { Confetti } from "@/components/Splash";
import { isTier, tierLabel } from "@/lib/tiers";
import { runFinding, type FindingGroup } from "@/lib/findingFlow";

const inter = Inter({ subsets: ["latin"], weight: ["600", "700", "800"] });
const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current";

export default function Finding({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [group, setGroup] = useState<FindingGroup | null>(null);
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<"checking" | "running" | "ready" | "error" | "redraw">("checking");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const previewAllowed = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_PREVIEW === "true";
    if (previewAllowed && query.get("preview") === "loading") {
      // A local demonstration: no API calls, fabricated group data, or generation.
      setGroup(null); setStep(0); setError(""); setPhase("running");
      const ticker = setInterval(() => setStep(value => Math.min(value + 1, 3)), 1400);
      const finish = setTimeout(() => {
        clearInterval(ticker);
        setStep(4); setPhase("ready");
      }, 10000);
      return () => { clearInterval(ticker); clearTimeout(finish); };
    }
    const controller = new AbortController();
    let disposed = false;
    let ticker: ReturnType<typeof setInterval> | undefined;
    setPhase("checking"); setStep(0); setError("");
    const timeout = setTimeout(() => controller.abort(new Error("Finding plans took too long. Try again.")), 30000);
    const clear = () => { clearTimeout(timeout); if (ticker) clearInterval(ticker); };
    void runFinding(id, controller.signal, {
      update: setGroup,
      redraw: () => { clear(); setPhase("redraw"); },
      started: () => {
        setPhase("running");
        setGroup(previous => previous ? { ...previous, finding: { ...previous.finding, planCount: 0 } } : previous);
        ticker = setInterval(() => setStep(value => Math.min(value + 1, 3)), 1400);
      },
      ready: () => { clear(); setStep(4); setPhase("ready"); },
    }, undefined, query.get("new") === "1").catch(e => {
      if (disposed) return;
      clear();
      if (e.message === SETUP_REQUIRED_MESSAGE) {
        setPhase("checking");
        router.replace(`${groupHref({ id })}?setupRequired=1`);
        return;
      }
      setPhase("error");
      setError(controller.signal.aborted ? controller.signal.reason.message : e.message || "Couldn't make plans this time. Try again.");
    });
    return () => { disposed = true; clear(); controller.abort(); };
  }, [id, attempt, router]);

  if (phase === "checking") return null;

  if (phase === "redraw") return <main className={`${inter.className} mx-auto flex w-full max-w-[390px] flex-col gap-5 px-6 py-6 text-indigo`}>
    <Link href={groupHref({ id, round: group?.finding.round })} className={`text-sm underline ${focus}`}>Back to final plan</Link>
    <h1 className="font-[inherit] text-[28px] font-extrabold">Find new plans</h1>
    <p className="text-sm text-secondary">New plans need a majority vote. Once payment requests are sent, the final plan is locked.</p>
    <RedrawVote id={id} redraw={group?.redraw} onChanged={() => setAttempt(value => value + 1)} />
  </main>;

  const details = group?.finding;
  const count = details?.memberCount;
  const title = count == null ? "Finding plans…" : `Finding plans for ${count} ${count === 1 ? "person" : "people"}`;
  const planCount = details?.planCount || 0;
  const tier = details?.round?.group_tier ?? group?.groupTier;
  const rows = [
    ["Shared free time found", details?.slot ? availabilityLabel(details.slot) : "Matching times"],
    ["Places searched nearby", details?.maxDistanceMi == null ? "Checking preferences" : `within ${details.maxDistanceMi} mi`],
    ["Filtered to the group budget", isTier(tier) ? tierLabel(tier) : "Checking budget"],
    [planCount ? `Writing ${planCount} ${planCount === 1 ? "plan" : "plans"}` : "Writing plans", "almost there"],
  ];
  const running = phase === "running";
  return (
    <main className={`${inter.className} mx-auto flex min-h-[calc(100svh-var(--tab-bar-height))] relative isolate w-full max-w-[390px] flex-col bg-indigo text-white [--indigo:#28536B] [--pistachio:#CBE6C7] [--matcha:#8FB78F] [--orchid:#F3A5BC] [--pink:#F3A5BC] [--logo-ink:#28536B] [--azure:#B4CCCF] [--secondary:#35607A] [--matcha-ink:#1B3A1E] [--maroon:#8A1F47]`}>
      <div aria-hidden="true" className="finding-confetti"><Confetti /></div>
      <div className="px-6 pt-14 sm:pt-6">
        <Link href={groupHref({ id, round: group?.finding.round })} aria-label="Back" className={`flex h-11 w-11 items-center justify-center rounded-full bg-white text-indigo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
      </div>
      <div className="px-7 pb-8 pt-14">
        <div aria-hidden="true" className="flex h-24 items-end [--wave-loop:1.6s]">
          <div className={`h-[84px] w-[84px] shrink-0 rounded-full bg-pistachio motion-safe:[animation-delay:calc(var(--wave-loop)/-4)] ${running ? "motion-safe:animate-bob-wave" : ""}`} />
          <div className={`-ml-6 h-[84px] w-[84px] shrink-0 rounded-full bg-matcha motion-safe:[animation-delay:calc(var(--wave-loop)/-8)] ${running ? "motion-safe:animate-bob-wave" : ""}`} />
          <div className={`-ml-6 ${running ? "motion-safe:animate-bob-wave" : ""}`}><Smiley size={84} /></div>
        </div>
        <h1 className="mt-3.5 font-[inherit] text-[38px] font-extrabold leading-[1.05] tracking-[-1.5px]">{title}</h1>
        <p className="mt-3.5 text-base font-semibold leading-[1.4]">{phase === "ready" ? "Your plans are ready." : "Matching free times, budgets and what everyone is into."}</p>
      </div>
      <section aria-label="Finding progress" className="mt-auto flex flex-col gap-1.5 rounded-t-[32px] bg-white px-6 pb-[30px] pt-6 text-indigo">
        {details?.city && <p className="text-sm text-secondary">{details.city}</p>}
        {details?.round?.sample_places && <p className="text-sm font-bold text-maroon">Sample data</p>}
        <TimeNotice match={details?.timeMatch} />
        <ol>
          {rows.map(([label, detail], index) => {
            const done = index < step;
            const active = index === step && running;
            return <li key={index} className="flex items-center gap-3 border-b border-azure py-3 last:border-0 last:pb-[18px]">
              <span aria-hidden="true" className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full ${done ? "bg-orchid" : active ? "border-[3px] border-indigo border-t-transparent motion-safe:animate-[spin_0.9s_linear_infinite]" : "border-[3px] border-azure"}`}>
                {done && <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </span>
              <span className="min-w-0 flex-1 text-[15px] font-bold">{label}</span>
              <span className="max-w-[112px] text-right text-sm font-semibold text-secondary">{index === 3 && phase === "ready" ? "Ready" : detail}</span>
            </li>;
          })}
        </ol>
        {error && <p role="alert" className="text-sm text-maroon">{error}</p>}
        <button type="button" disabled={phase !== "ready" && phase !== "error"} aria-disabled={phase !== "ready" && phase !== "error"} onClick={() => { if (phase === "ready") router.push(`/groups/${id}/plans`); else if (phase === "error") setAttempt(value => value + 1); }} className={`h-14 w-full rounded-2xl bg-matcha text-[17px] font-bold text-matchaink disabled:pointer-events-none disabled:opacity-50 ${focus}`}>{phase === "error" ? "Try again" : "See plans"}</button>
      </section>
      <p role="status" aria-live="polite" className="sr-only">{phase === "ready" ? "Plans are ready. Choose See plans to continue." : phase === "error" ? error : `${title}. ${rows[Math.min(step, 3)][0]}.`}</p>
    </main>
  );
}
