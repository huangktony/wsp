"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Page, Err } from "@/components/Page";
import { api } from "@/lib/client";

export default function NewGroup() {
  const r = useRouter();
  const [name, setName] = useState(""), [city, setCity] = useState("Austin, TX"), [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const go = (p: Promise<{ id: number }>) => p.then((d) => r.push(`/groups/${d.id}`)).catch((e) => setErr(e.message));
  return (
    <Page title="New group" back="/groups">
      <div className="space-y-3">
        <input className="input" placeholder="Group name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
        <button className="btn" disabled={!name || !city} onClick={() => go(api("/api/groups", "POST", { name, city }))}>Create group</button>
      </div>
      <p className="my-6 text-center text-sm font-semibold text-muted">or join with a code</p>
      <div className="space-y-3">
        <input className="input uppercase" placeholder="Invite code" value={code} onChange={(e) => setCode(e.target.value)} />
        <button className="btn-ghost" disabled={!code} onClick={() => go(api("/api/groups/join", "POST", { code }))}>Join group</button>
        <Err msg={err} />
      </div>
    </Page>
  );
}
