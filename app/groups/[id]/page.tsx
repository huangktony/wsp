"use client";
import Link from "next/link";
import { Inter } from "next/font/google";
import { use, useEffect, useRef, useState } from "react";
import { useApi } from "@/lib/client";

const inter = Inter({ subsets: ["latin"], weight: ["400", "600", "700", "800"] });
const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo";
const avatarColors = ["bg-matcha text-matchaink", "bg-orchid text-orchidink", "bg-peach text-indigo", "border border-azure bg-pistachio text-indigo"];
const primary = `flex min-h-[54px] w-full items-center justify-center rounded-[14px] bg-matcha px-4 py-3 text-[17px] font-bold text-matchaink ${focus}`;

type Member = { id: number; name: string; setup_done: boolean };

export default function GroupHome({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: g, error } = useApi<any>(`/api/groups/${id}`);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setCopied(false);
    setCopyError("");
    return () => { if (copyTimer.current) clearTimeout(copyTimer.current); };
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
  const members: Member[] = g?.members ?? [];
  const pending = members.filter((member) => !member.setup_done);
  const ready = members.length - pending.length;
  const progress = members.length ? Math.round(ready / members.length * 100) : 0;
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
  const open = g?.round?.status === "voting", final = g?.round?.status === "final";
  return (
    <main className={`${inter.className} mx-auto flex min-h-[100svh] w-full max-w-[390px] flex-col gap-[18px] bg-white px-6 pb-7 pt-6 text-indigo`}>
      <header className="flex flex-col gap-1">
        <Link href="/groups" className={`flex min-h-11 w-fit items-center rounded py-1 text-[15px] text-secondary ${focus}`}>Back to groups</Link>
        {g && <>
          <h1 className="break-words font-[inherit] text-[28px] font-extrabold leading-tight tracking-[-0.5px]">{g.name}</h1>
          <p className="text-[15px] text-secondary">{[g.city, g.groupTier ? `group cap ${g.groupTier}` : null].filter(Boolean).join(" · ")}</p>
        </>}
      </header>
      {!g ? <p role={error ? "alert" : "status"} className={`text-sm ${error ? "text-maroon" : "text-secondary"}`}>{error || "Loading…"}</p> : <>
        <section aria-label="Group readiness" className="flex flex-col gap-2.5 rounded-2xl border border-azure bg-pistachio p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-[15px] font-bold">{ready} of {members.length} ready</span>
          </div>
          <div role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${ready} of ${members.length} members ready`} className="h-3 overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full bg-orchid transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${progress}%` }} />
          </div>
        </section>
        {g.invite_code && <div>
          <section aria-label="Invite code" className="flex items-center justify-between gap-2 rounded-[20px] bg-indigo px-5 py-[18px] text-white">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-xs font-bold text-pistachio">INVITE CODE</span>
              <span className="break-all text-[30px] font-extrabold leading-tight tracking-[3px] tabular-nums">{g.invite_code}</span>
            </div>
            <button type="button" onClick={copyCode} className="h-10 shrink-0 rounded-[20px] bg-peach px-[18px] text-sm font-extrabold text-indigo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pistachio"><span aria-live="polite">{copied ? "Copied" : "Copy"}</span></button>
          </section>
          {copyError && <p role="status" className="mt-2 text-sm text-maroon">{copyError}</p>}
        </div>}
        <section aria-labelledby="members-heading">
          <h2 id="members-heading" className="pb-1.5 font-[inherit] text-sm font-bold text-secondary">Members</h2>
          <ul>
            {members.map((member, index) => (
              <li key={member.id} className="flex items-center gap-3 border-b border-azure py-3 last:border-b-0">
                <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-extrabold ${avatarColors[index % avatarColors.length]}`}>{member.name.trim().charAt(0).toUpperCase()}</span>
                <span className="min-w-0 flex-1 break-words text-base font-bold">{memberName(member)}</span>
                <span className={`shrink-0 rounded-xl px-2.5 py-1 text-[13px] font-bold ${member.setup_done ? "bg-peach text-indigo" : "bg-orchid text-orchidink"}`}>{member.setup_done ? "Ready" : "Setting up"}</span>
              </li>
            ))}
          </ul>
        </section>
        <div className="mt-auto flex flex-col gap-2.5">
          <p className="text-center text-[13px] leading-[1.4] text-secondary">{helper}</p>
          {open && <Link href={`/groups/${id}/plans`} className={primary}>Vote on plans</Link>}
          {final && <Link href={`/groups/${id}/final`} className={primary}>See final plan</Link>}
          {!open && <Link href={`/groups/${id}/finding`} className={primary}>{final ? "Find new plans" : "Find plans"}</Link>}
          <Link href={`/groups/${id}/setup`} className={`flex min-h-[50px] w-full items-center justify-center rounded-[14px] border border-outline bg-transparent px-4 py-3 text-base font-semibold ${focus}`}>Edit my setup</Link>
        </div>
      </>}
    </main>
  );
}
