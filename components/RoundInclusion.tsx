"use client";
import Link from "next/link";
import { useState } from "react";
import { SETUP_REQUIRED_MESSAGE } from "@/lib/finding";
import type { roundInclusion } from "@/lib/roundParticipation";

type Inclusion = ReturnType<typeof roundInclusion>;
export function InclusionBanner({ inclusion }: { inclusion?: Inclusion }) {
  return inclusion?.banner ? <p role="status" className="rounded-2xl bg-[#F3A5BC] p-3 text-sm text-[#7A1A3F]">{inclusion.banner}</p> : null;
}
export function RerunPlans({ id, inclusion, setupComplete }: { id: string; inclusion?: Inclusion; setupComplete: boolean }) {
  const [error, setError] = useState(false);
  if (!inclusion?.canRerun) return null;
  return <div className="my-3 space-y-2">
    <p className="text-sm text-secondary">{inclusion.rerunMessage}</p>
    <p className="text-sm text-secondary">This replaces the current plans and clears votes.</p>
    {error && !setupComplete && <p role="alert" className="rounded-2xl bg-[#F3A5BC] p-3 text-sm text-[#7A1A3F]">{SETUP_REQUIRED_MESSAGE} <Link className="font-bold underline" href={`/groups/${id}/setup`}>Make my setup</Link></p>}
    <Link href={`/groups/${id}/finding`} onClick={event => { if (!setupComplete) { event.preventDefault(); setError(true); } }} className="flex min-h-[48px] items-center justify-center rounded-2xl bg-matcha px-4 py-3 font-bold text-matchaink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo">Re-run plans</Link>
  </div>;
}
