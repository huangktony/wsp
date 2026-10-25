"use client";
import { BackButton } from "@/components/BackButton";
import { Inter } from "next/font/google";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Page } from "@/components/Page";
import { CityCombobox } from "@/components/CityCombobox";
import { InviteCodeInput } from "@/components/InviteCodeInput";
import { groupHref } from "@/lib/finding";
import { api } from "@/lib/client";

const inter = Inter({ subsets: ["latin"], weight: ["400", "600", "700", "800"] });
const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo";
const input = "box-border h-[54px] w-full rounded-2xl border-2 border-outline bg-surface px-4 font-[inherit] text-base text-indigo placeholder:text-secondary/80 focus:border-indigo focus:outline-none focus:ring-2 focus:ring-indigo focus:ring-offset-2 focus:ring-offset-surface";

export default function NewGroup() {
  const r = useRouter();
  const [name, setName] = useState(""), [city, setCity] = useState(""), [code, setCode] = useState("WSP-");
  const [isComplete, setIsComplete] = useState(false);
  const [err, setErr] = useState("");
  const [action, setAction] = useState<"create" | "join" | null>(null);
  const [busy, setBusy] = useState(false);
  const go = (p: Promise<{ id: number }>, source: "create" | "join") => {
    setAction(source);
    setBusy(true);
    setErr("");
    return p.then(async (d) => {
      const group = await api(`/api/groups/${d.id}`);
      r.push(groupHref({ ...group, id: d.id }));
    }).catch((e) => {
      setErr(e.message);
      setBusy(false);
    });
  };
  const canJoin = isComplete && !busy;
  const join = () => { if (canJoin) void go(api("/api/groups/join", "POST", { code }), "join"); };
  return (
    <Page variant="plain">
      <div className={`${inter.className} flex min-h-[calc(100svh-var(--tab-bar-height))] flex-col gap-[18px] px-6 pb-[132px] pt-6 text-indigo`}>
        <BackButton href="/groups" className="mb-2" />
        <h1 className="font-[inherit] text-[36px] font-extrabold leading-[1.05] tracking-[-1.4px]">Start a group</h1>
        <div className="flex flex-col gap-3">
          <input type="text" aria-label="Group name" aria-describedby={err && action === "create" ? "create-error" : undefined} className={input} placeholder="Group name" value={name} onChange={(e) => setName(e.target.value)} />
          <CityCombobox value={city} onChange={setCity} className={input}
            describedBy={err && action === "create" ? "create-error" : undefined} />
          {err && action === "create" && <p id="create-error" role="alert" className="text-sm text-maroon">{err}</p>}
        </div>
        <div className="flex items-center gap-3 text-[13px] font-bold text-secondary">
          <span aria-hidden="true" className="h-px flex-1 bg-azure" />
          <span>OR JOIN WITH A CODE</span>
          <span aria-hidden="true" className="h-px flex-1 bg-azure" />
        </div>
        <div>
          <div className="flex gap-2.5">
            <InviteCodeInput value={code} onChange={(fullCode, complete) => { setCode(fullCode); setIsComplete(complete); }}
              onSubmit={join} describedBy={err && action === "join" ? "join-error" : undefined} className="min-w-0 flex-1" />
            <button type="button" disabled={!canJoin} aria-disabled={!canJoin} aria-busy={busy && action === "join"} onClick={join} className={`h-[54px] shrink-0 rounded-2xl bg-pistachio px-[22px] text-base font-extrabold disabled:pointer-events-none disabled:opacity-50 ${focus}`}>Join</button>
          </div>
          {err && action === "join" && <p id="join-error" role="alert" className="mt-3 text-sm text-maroon">{err}</p>}
        </div>
        <div className="fixed bottom-[var(--tab-bar-height)] left-1/2 z-20 w-full max-w-[390px] -translate-x-1/2 border-t border-azure bg-surface px-6 pb-[30px] pt-3.5">
          <button type="button" disabled={!name || !city || busy} aria-busy={busy && action === "create"} onClick={() => go(api("/api/groups", "POST", { name, city }), "create")} className={`flex h-14 w-full items-center justify-center rounded-2xl bg-matcha text-[17px] font-extrabold text-matchaink disabled:pointer-events-none disabled:opacity-50 ${focus}`}>Create group</button>
        </div>
      </div>
    </Page>
  );
}
