"use client";

import { useSetupGate } from "@/lib/useSetupGate";
import { useFindingRedirect } from "@/lib/useFindingRedirect";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { BackButton } from "@/components/BackButton";
import { Inter } from "next/font/google";
import { use, useEffect, useRef, useState } from "react";
import { RedrawVote } from "@/components/RedrawVote";
import { Skeleton, SkeletonBlock } from "@/components/Skeleton";
import { api, useApi } from "@/lib/client";

const inter = Inter({ subsets: ["latin"], weight: ["400", "600", "700", "800"] });
const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo";
const avatarColors = ["bg-matcha text-matchaink", "bg-orchid text-orchidink", "bg-peach text-indigo", "border border-azure bg-pistachio text-indigo"];
const primary = `flex min-h-[54px] w-full items-center justify-center rounded-[14px] bg-matcha px-4 py-3 text-[17px] font-bold text-matchaink ${focus}`;

const pill = `flex min-h-[48px] w-full items-center justify-center rounded-full px-4 py-3 text-base font-bold disabled:opacity-60 ${focus}`;
// text-surface is white in light mode and the dark surface in dark mode, where maroon turns into a light pink.
const danger = `${pill} bg-maroon text-surface`;
const quiet = `${pill} border border-outline bg-transparent text-indigo`;

type Member = {
  id: number;
  name: string;
  avatar?: string | null;
  setup_done: boolean;
  has_voted: boolean;
};

export default function GroupHome({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: g, error, reload } = useApi<any>(`/api/groups/${id}`, 4000, true);
  useFindingRedirect(id, g);
  useSetupGate(id);
  const router = useRouter();
  const [confirm, setConfirm] = useState<"delete" | "leave" | null>(null);
  const [newOwner, setNewOwner] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setCopied(false);
    setCopyError("");
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, [g?.invite_code, id]);

  const copyCode = async () => {
    if (!g?.invite_code) return;
    try {
      await navigator.clipboard.writeText(g.invite_code);
      setCopyError("");
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError("Could not copy. Select and copy the code instead.");
    }
  };

  const run = (call: () => Promise<unknown>) => {
    setBusy(true);
    setActionError("");
    call()
      .then(() => router.push("/groups"))
      .catch((e) => {
        setActionError(e.message);
        setBusy(false);
      });
  };

  const members: Member[] = g?.members ?? [];
  const others = members.filter((member) => member.id !== g?.me);
  const isOwner = g?.isCreator === true;
  const soloOwner = isOwner && others.length === 0;
  const needsNewSearch = g?.finding?.needsNewSearch === true || g?.finding?.cityChanged === true;
  const open = g?.roundOpen === true;
  const final = g?.round?.status === "final";

  // What the progress card is counting. The ready count itself is unchanged.
  const phase = final ? "final plan picked" : open ? "voting" : g?.round?.status === "generating" ? "finding plans" : "setup";
  const pending = members.filter((member) => open ? !member.has_voted : !member.setup_done);
  const total = open ? g.memberCount : members.length;
  const ready = open ? g.voted : members.length - pending.length;
  const progress = total ? Math.round(ready / total * 100) : 0;
  const memberName = (member: Member) => member.id === g.me ? "You" : member.name;

  let helper = "Everyone is ready.";
  if (pending.length === 1) {
    helper = `${memberName(pending[0])} ${pending[0].id === g.me ? "have" : "has"} not finished yet. You can find plans now and re-run them when ${pending[0].id === g.me ? "you are" : "they are"} done.`;
  } else if (pending.length === 2) {
    helper = `${memberName(pending[0])} and ${pending[1].id === g.me ? "you" : pending[1].name} have not finished yet. You can find plans now and re-run them when they are done.`;
  } else if (pending.length > 2) {
    helper = `${pending.length} members have not finished yet. You can find plans now and re-run them when they are done.`;
  } else if (!members.length) {
    helper = "No members yet.";
  }

  if (open) {
    const missing = pending.length === 1
      ? `${memberName(pending[0])} ${pending[0].id === g.me ? "have" : "has"}`
      : pending.length === 2
        ? `${memberName(pending[0])} and ${pending[1].id === g.me ? "you" : pending[1].name} have`
        : `${pending.length} members have`;
    helper = pending.length
      ? `${missing} not voted yet. Voting closes at the deadline or once everyone has voted on every plan.`
      : "Everyone has voted.";
  }

  return (
    <main className={`${inter.className} mx-auto flex min-h-[100svh] w-full max-w-[390px] flex-col gap-[18px] bg-surface px-6 pb-7 pt-6 text-indigo`}>
      <header className="flex flex-col gap-1">
        <BackButton href="/groups" className="mb-3" />
        {g && <>
          <h1 className="break-words font-[inherit] text-[28px] font-extrabold leading-tight tracking-[-0.5px]">{g.name}</h1>
          <p className="text-[15px] text-secondary">{[g.city, g.groupTier ? `group cap ${g.groupTier}` : null].filter(Boolean).join(" · ")}</p>
        </>}
        {!g && !error && <><SkeletonBlock className="h-[35px] w-2/3" /><SkeletonBlock className="mt-1 h-[23px] w-1/3" /></>}
      </header>
      {!g ? (error ? <p role="alert" className="text-sm text-maroon">{error}</p> : (
        <Skeleton className="flex flex-1 flex-col gap-[18px]">
          <SkeletonBlock className="h-[79px]" />
          <SkeletonBlock className="h-[94px] !rounded-[20px]" />
          <div><SkeletonBlock className="mb-1.5 h-5 w-20" /><div className="space-y-1.5">{[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} className="h-[60px]" />)}</div></div>
          <div className="mt-auto flex flex-col gap-2.5">
            <SkeletonBlock className="h-[18px]" /><SkeletonBlock className="h-[54px]" /><SkeletonBlock className="h-[76px] !rounded-full" /><SkeletonBlock className="h-[50px] !rounded-full" /><SkeletonBlock className="h-12 !rounded-full" />
          </div>
        </Skeleton>
      )) : <>
        <section aria-label="Group readiness" className="flex flex-col gap-2.5 rounded-2xl border border-azure bg-pistachio p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-[15px] font-bold">{ready} of {total} ready <span className="text-[13px] font-normal text-secondary">· {phase}</span></span>
          </div>
          <div role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${ready} of ${total} members ${open ? "have voted" : "ready"}`} className="h-3 overflow-hidden rounded-full bg-surface">
            <div className="h-full rounded-full bg-orchid transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${progress}%` }} />
          </div>
        </section>
        {g.invite_code && <div>
          <section aria-label="Invite code" className="flex items-center justify-between gap-2 rounded-[20px] bg-panel px-5 py-[18px] text-white">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-xs font-bold text-panelsoft">INVITE CODE</span>
              <span className="break-all text-[30px] font-extrabold leading-tight tracking-[3px] tabular-nums">{g.invite_code}</span>
            </div>
            <button type="button" onClick={copyCode} className="h-10 shrink-0 rounded-[20px] bg-peach px-[18px] text-sm font-extrabold text-indigo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-panelsoft"><span aria-live="polite">{copied ? "Copied" : "Copy"}</span></button>
          </section>
          {copyError && <p role="status" className="mt-2 text-sm text-maroon">{copyError}</p>}
        </div>}
        <section aria-labelledby="members-heading">
          <h2 id="members-heading" className="pb-1.5 font-[inherit] text-sm font-bold text-secondary">Members</h2>
          <ul>
            {members.map((member, index) => (
              <li key={member.id} className="flex items-center gap-3 border-b border-azure py-3 last:border-b-0">
                <Avatar name={member.name} src={member.avatar} className={`h-10 w-10 text-base ${avatarColors[index % avatarColors.length]}`} />
                <span className="min-w-0 flex-1 break-words text-base font-bold">{memberName(member)}</span>
                <span className={`shrink-0 rounded-xl px-2.5 py-1 text-[13px] font-bold ${(open ? member.has_voted : member.setup_done) ? "bg-peach text-indigo" : "bg-orchid text-orchidink"}`}>{open ? (member.has_voted ? "Voted" : "Not voted yet") : (member.setup_done ? "Ready" : "Setting up")}</span>
              </li>
            ))}
          </ul>
        </section>
        <div className="mt-auto flex flex-col gap-2.5">
          <p className="text-center text-[13px] leading-[1.4] text-secondary">{helper}</p>
          {!final && g.finding?.settingsChanged && <p className="text-sm text-secondary">Settings changed. Find new plans to update.</p>}
          {open && !needsNewSearch && <Link href={`/groups/${id}/plans`} className={primary}>Vote on plans</Link>}
          {final && <Link href={`/groups/${id}/final`} className={primary}>See final plan</Link>}
          {!final && (!open || needsNewSearch) && (
            <Link href={`/groups/${id}/finding${needsNewSearch ? "?new=1" : ""}`} className={primary}>
              {needsNewSearch ? "Find new plans" : "Find plans"}
            </Link>
          )}
          {final && <RedrawVote id={id} redraw={g.redraw} onChanged={reload} />}
          {!final && <Link href={`/groups/${id}/setup`} className={`flex min-h-[50px] w-full items-center justify-center rounded-[14px] border border-outline bg-transparent px-4 py-3 text-base font-semibold ${focus}`}>Edit my setup</Link>}
          {confirm === "delete" && <div role="alertdialog" aria-label="Confirm delete" className="flex flex-col gap-2.5 rounded-2xl border border-maroon p-4">
            <p className="text-[15px] font-bold">Delete {g.name}? This removes the group, plans, and votes for everyone.</p>
            <button type="button" disabled={busy} onClick={() => run(() => api(`/api/groups/${id}`, "DELETE"))} className={danger}>Delete group</button>
            <button type="button" disabled={busy} onClick={() => setConfirm(null)} className={quiet}>Cancel</button>
          </div>}
          {confirm === "leave" && <div role="alertdialog" aria-label="Confirm leave" className="flex flex-col gap-2.5 rounded-2xl border border-outline p-4">
            {g?.myDues > 0 ? <>
              <p role="alert" className="text-[15px] font-bold">You owe ${g.myDues.toFixed(2)} in this group. Pay your dues before leaving.</p>
              <Link href={`/groups/${id}/final`} className={primary}>Pay now</Link>
            </> : isOwner ? <>
              <p className="text-[15px] font-bold">Pick a new owner before you leave {g.name}.</p>
              <ul className="flex flex-col gap-2">
                {others.map((member) => (
                  <li key={member.id}><button type="button" aria-pressed={newOwner === member.id} onClick={() => setNewOwner(member.id)} className={`${pill} ${newOwner === member.id ? "bg-matcha text-matchaink" : "border border-outline text-indigo"}`}>{member.name}</button></li>
                ))}
              </ul>
              <button type="button" disabled={busy || newOwner === null} onClick={() => run(() => api(`/api/groups/${id}/leave`, "POST", { newOwnerId: newOwner }))} className={danger}>Transfer ownership &amp; leave</button>
            </> : <>
              <p className="text-[15px] font-bold">Leave {g.name}? Your votes and preferences for this group will be removed.</p>
              <button type="button" disabled={busy} onClick={() => run(() => api(`/api/groups/${id}/leave`, "POST", {}))} className={danger}>Leave group</button>
            </>}
            <button type="button" disabled={busy} onClick={() => setConfirm(null)} className={quiet}>Cancel</button>
          </div>}
          {actionError && <p role="alert" className="text-center text-sm text-maroon">{actionError}</p>}
          {!confirm && <>
            {soloOwner
              ? <p className="text-center text-[13px] leading-[1.4] text-secondary">You're the only member, so you can't leave. Delete the group instead.</p>
              : <button type="button" onClick={() => { setNewOwner(null); setConfirm("leave"); }} className={quiet}>Leave group</button>}
            {isOwner && <button type="button" onClick={() => setConfirm("delete")} className={danger}>Delete group</button>}
          </>}
        </div>
      </>}
    </main>
  );
}
