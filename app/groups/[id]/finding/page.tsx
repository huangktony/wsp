"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Err } from "@/components/Page";
import { api } from "@/lib/client";

const STEPS = ["Matching everyone's availability", "Checking your group's budget", "Searching nearby places", "Writing 3 plans"];

export default function Finding({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const r = useRouter();
  const [step, setStep] = useState(0), [err, setErr] = useState("");
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 900);
    // Minimum animation time so the checklist is readable even when mocks answer instantly.
    Promise.all([api(`/api/groups/${id}/plans`, "POST"), new Promise((ok) => setTimeout(ok, 3800))])
      .then(() => r.replace(`/groups/${id}/plans`))
      .catch((e) => setErr(e.message));
    return () => clearInterval(t);
  }, [id, r]);
  return (
    <main className="px-5 pt-20 text-center">
      <div className="animate-bounce inline-block"><Logo size={88} /></div>
      <h1 className="mt-4 mb-6 text-3xl font-bold">Finding plans…</h1>
      <ul className="mx-auto max-w-[280px] space-y-3 text-left">
        {STEPS.map((s, i) => <li key={s} className={`flex gap-3 ${i <= step ? "" : "opacity-30"}`}><span>{i < step ? "✓" : "•"}</span>{s}</li>)}
      </ul>
      <Err msg={err} />
    </main>
  );
}
