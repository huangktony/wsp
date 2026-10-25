"use client";

import Link from "next/link";
import { groupHref } from "@/lib/finding";
import { InclusionBanner, RerunPlans } from "@/components/RoundInclusion";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { Inter } from "next/font/google";
import { useRouter } from "next/navigation";
import { Page, Err } from "@/components/Page";
import { TierBadge } from "@/components/TierBadge";
import { Skeleton, SkeletonBlock } from "@/components/Skeleton";
import { api, useApi } from "@/lib/client";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
});

// Screen 9: Plans and voting. Approve or veto each plan.
// Votes are anonymous until voting closes.
type Vote = "approve" | "veto" | null;

function left(ms: number) {
  if (ms <= 0) return "Voting is closing…";
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return h
    ? `Voting ends in ${h}h ${m % 60}m`
    : m
      ? `Voting ends in ${m}m`
      : "Voting ends in under a minute";
}

function PlansSkeleton() {
  return (
    <Skeleton>
      <SkeletonBlock className="mb-1 h-[23px] w-1/3" />
      <SkeletonBlock className="mb-3 h-[31px] w-3/4" />
      <div className="mb-5 flex flex-wrap gap-2">
        <SkeletonBlock className="h-7 w-32 !rounded-full" />
        <SkeletonBlock className="h-7 w-40 !rounded-full" />
        <SkeletonBlock className="h-7 w-36 !rounded-full" />
      </div>
      <div className="space-y-4">
        <SkeletonBlock className="h-[297px]" />
        <SkeletonBlock className="h-[248px]" />
        <SkeletonBlock className="h-[346px]" />
      </div>
      <SkeletonBlock className="mt-5 h-[59px]" />
      <SkeletonBlock className="mt-4 h-14" />
    </Skeleton>
  );
}

export default function Plans({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const r = useRouter();
  const { data, error, reload } = useApi<any>(
    `/api/groups/${id}/plans`,
    3000,
  );
  const [err, setErr] = useState("");
  const [mine, setMine] = useState<Record<number, Vote>>({});
  const savingRef = useRef(new Set<number>());
  const [saving, setSaving] = useState<number[]>([]);
  const [now, setNow] = useState(() => Date.now());

  // Stop overriding a vote once a fresh server response confirms it. Keep an
  // in-flight mutation's override even if an older poll arrives meanwhile.
  useEffect(() => {
    if (!data?.plans) return;
    setMine((previous) => {
      const next = { ...previous };
      let changed = false;
      for (const key of Object.keys(previous)) {
        const planId = Number(key);
        const plan = data.plans.find((p: any) => p.id === planId);
        if (
          !savingRef.current.has(planId) &&
          (!plan || (plan.my_vote ?? null) === previous[planId])
        ) {
          delete next[planId];
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [data, saving]);

  const deadline = useMemo(
    () =>
      data?.round ? Date.now() + data.round.seconds_left * 1000 : 0,
    [data],
  );

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  const status = data?.round?.status;
  useEffect(() => {
    if (status === "final") r.replace(`/groups/${id}/final`);
    if (
      (status === "vetoed" || status === "generating") &&
      data?.inclusion?.canVote
    ) {
      r.replace(`/groups/${id}/finding`);
    }
  }, [status, id, r, data?.inclusion?.canVote]);

  const backHref =
    status === "final"
      ? groupHref({ id, round: data.round })
      : groupHref({ id });

  if (!data) {
    return (
      <div className={inter.className}>
        <Page back={backHref}>
          {error ? (
            <p role="alert" className="text-sm text-maroon">
              {error}
            </p>
          ) : (
            <PlansSkeleton />
          )}
        </Page>
      </div>
    );
  }

  if (status === "failed" || status === "superseded") {
    return (
      <div className={inter.className}>
        <Page back={backHref}>
          <p role="alert" className="text-sm text-maroon">
            {data.round.search_error ||
              "These plans are no longer available. Try finding plans again."}
          </p>
          <Link href={`/groups/${id}/finding`} className="btn mt-4">
            Try again
          </Link>
        </Page>
      </div>
    );
  }

  if (!data.round || !["voting", "vetoed"].includes(status)) {
    return (
      <div className={inter.className}>
        <Page back={backHref}>
          {data.round ? <PlansSkeleton /> : "No plans yet."}
        </Page>
      </div>
    );
  }

  const voteOf = (p: any): Vote =>
    p.id in mine ? mine[p.id] : p.my_vote ?? null;

  const vote = (p: any, v: Exclude<Vote, null>) => {
    if (
      status !== "voting" ||
      !data.inclusion?.canVote ||
      savingRef.current.has(p.id)
    ) {
      return;
    }

    const next = voteOf(p) === v ? null : v; // tap again to undo
    savingRef.current.add(p.id);
    setSaving([...savingRef.current]);
    setMine((m) => ({ ...m, [p.id]: next }));
    setErr("");

    api(`/api/plans/${p.id}/vote`, "POST", { value: next })
      .then(reload)
      .catch((e) => {
        setErr(e.message);
        setMine((m) => {
          const { [p.id]: _, ...rest } = m;
          return rest;
        });
      })
      .finally(() => {
        savingRef.current.delete(p.id);
        setSaving([...savingRef.current]);
      });
  };

  const close = () =>
    api(`/api/groups/${id}/final`, "POST")
      .then(reload)
      .catch((e) => setErr(e.message));

  const myCount = data.plans.filter((p: any) => voteOf(p)).length;
  const serverHasMyVote = data.plans.some((p: any) => p.my_vote != null);
  const voted = Math.max(
    0,
    Math.min(
      data.memberCount,
      data.voted - Number(serverHasMyVote) + Number(myCount > 0),
    ),
  );

  return (
    <div className={inter.className}>
      <Page back={backHref}>
        {data.round.sample_places && (
          <p className="mb-2 text-sm font-bold text-maroon">Sample data</p>
        )}
        {data.round.search_city && (
          <p className="mb-2 text-sm text-secondary">
            {data.round.search_city}
          </p>
        )}
        <p className="text-[15px] font-semibold text-secondary">
          {data.group.name}
          {data.round.attempt > 1 && ` · Round ${data.round.attempt}`}
        </p>
        <h1 className="mb-3 font-[inherit] text-[28px] font-extrabold leading-[1.1] tracking-[-0.5px] text-indigo">
          {data.plans.length} {data.plans.length === 1 ? "plan" : "plans"} for{" "}
          {data.round.slot}
        </h1>
        <div className="mb-5 flex flex-wrap gap-2 [&>span]:text-xs [&_span]:font-bold">
          <span className="chip-pink">
            {status === "voting" ? left(deadline - now) : "Voting closed"}
          </span>
          <span className="chip" aria-live="polite">
            {voted} of {data.memberCount} have voted
          </span>
          <TierBadge tier={data.round.group_tier} label="Group budget" />
        </div>

        <InclusionBanner inclusion={data.inclusion} />
        <RerunPlans
          id={id}
          inclusion={data.inclusion}
          setupComplete={data.members.some(
            (m: any) => m.id === data.me && m.setup_done,
          )}
        />
        {!data.inclusion?.canVote && (
          <p className="my-3 text-sm text-secondary">
            <Link
              href={`/groups/${id}/setup`}
              className="font-bold underline focus-visible:outline focus-visible:outline-2"
            >
              Make your setup to vote
            </Link>
            {data.members.some(
              (m: any) => m.id === data.me && m.setup_done,
            ) && " · Re-run plans to include your setup in this round."}
          </p>
        )}

        <div className="space-y-4">
          {data.plans.map((p: any) => {
            const v = voteOf(p);
            return (
              <article
                key={p.id}
                className={`card ${
                  v === "approve"
                    ? "border-2 border-sage"
                    : v === "veto"
                      ? "border-2 border-deep"
                      : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-[inherit] text-xl font-extrabold leading-[1.25] tracking-[-0.3px] text-indigo">
                    {p.title}
                  </h2>
                  <span className="whitespace-nowrap text-[15px] font-bold text-sageink">
                    {p.stops.some((s: any) => s.estimated) && "est. "}~$
                    {Math.round(p.cost)} each
                  </span>
                </div>
                <p className="mt-1 text-sm font-normal text-secondary">
                  {data.round.slot} · {p.stops.length}{" "}
                  {p.stops.length === 1 ? "stop" : "stops"} · {p.price_level}
                </p>
                <ol className="my-3 space-y-1 text-sm font-normal">
                  {p.stops.map((s: any, i: number) => (
                    <li key={i}>
                      <b className="font-bold">{s.time}</b> · {s.place}
                    </li>
                  ))}
                </ol>
                <p className="text-sm leading-[1.45] text-secondary">
                  <b className="font-bold">Why:</b> {p.why_fits}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    disabled={
                      status !== "voting" ||
                      !data.inclusion?.canVote ||
                      saving.includes(p.id)
                    }
                    aria-pressed={v === "approve"}
                    onClick={() => vote(p, "approve")}
                    className={`h-12 rounded-2xl disabled:opacity-50 text-[15px] font-bold ${
                      v === "approve"
                        ? "bg-sage text-sageink"
                        : "border border-line"
                    }`}
                  >
                    ✓ Approve
                  </button>
                  <button
                    disabled={
                      status !== "voting" ||
                      !data.inclusion?.canVote ||
                      saving.includes(p.id)
                    }
                    aria-pressed={v === "veto"}
                    onClick={() => vote(p, "veto")}
                    className={`h-12 rounded-2xl disabled:opacity-50 text-[15px] font-bold ${
                      v === "veto"
                        ? "bg-deep text-white"
                        : "border border-line"
                    }`}
                  >
                    ✕ Veto
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <Err msg={err || error} />
        <p className="mt-5 text-center text-[13px] text-secondary">
          {myCount < data.plans.length
            ? `You've voted on ${myCount} of ${data.plans.length} plans. `
            : "You're done. "}
          Votes are anonymous until the end. Voting closes at the deadline or
          once everyone has voted on every plan.
        </p>
        {status === "voting" &&
          data.isCreator &&
          data.inclusion?.canVote && (
            <button className="btn-ghost mt-4" onClick={close}>
              Close voting now
            </button>
          )}
      </Page>
    </div>
  );
}
