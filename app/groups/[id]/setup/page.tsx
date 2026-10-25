"use client";

import { AvailabilityPicker } from "@/components/AvailabilityPicker";
import { normalizeAvailability } from "@/lib/availability";
import { groupHref } from "@/lib/finding";
import { useFindingRedirect } from "@/lib/useFindingRedirect";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Inter } from "next/font/google";
import { BackButton } from "@/components/BackButton";
import { Page, Err } from "@/components/Page";
import { LinkBank } from "@/components/LinkBank";
import { ComfortPicker } from "@/components/ComfortPicker";
import { api, useApi } from "@/lib/client";
import { readPreferences, GROUP_INTERESTS, interestLabel, interestState, cycleInterest, type Preferences, restoreInterestChoices, addCustomInterest, cycleCustomInterest, saveInterestChoices, type CustomInterest } from "@/lib/setupPreferences";
import type { Tier } from "@/lib/tiers";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
});

export default function Setup({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const r = useRouter();
  const { data: group } = useApi<any>(`/api/groups/${id}`, 4000, true);
  useFindingRedirect(id, group);

  const { data } = useApi<any>(`/api/groups/${id}/me`);

  // Filled in after linking on this page, so the form below is not reset by a reload.
  const [linked, setLinked] = useState<{
    tier: Tier;
    avg: number | null;
  } | null>(null);
  const [picked, setPicked] = useState<Tier | null>(null);
  const [av, setAv] = useState<string[]>([]);
  const [it, setIt] = useState<string[]>([]);
  const [mi, setMi] = useState(10);
  const [err, setErr] = useState("");
  const [preferences, setPreferences] = useState<Preferences>(readPreferences(null));
  const [specificOpen, setSpecificOpen] = useState(false);
  const [customs, setCustoms] = useState<CustomInterest[]>([]);
  const [draft, setDraft] = useState("");
  const [customError, setCustomError] = useState("");
  const [extrasUnavailable, setExtrasUnavailable] = useState(false);
  const setPreference = <K extends keyof Preferences>(key: K, value: Preferences[K]) => setPreferences(p => ({ ...p, [key]: value }));
  const inputStyle = "w-full rounded-2xl border-2 border-[#6F98A2] bg-white px-4 py-3 text-base text-[#28536B]";

  useEffect(() => {
    if (data) {
      setAv(normalizeAvailability(data.availability));
      setIt(data.interests);
      setMi(data.max_distance_mi);
      setPicked(data.comfort_tier ?? null);
      const saved = readPreferences(data.preferences);
      const restored = restoreInterestChoices(data.interests, saved);
      setIt(restored.likes);
      setCustoms(restored.customs);
      setPreferences({ ...saved, avoids: restored.avoids });
    }
  }, [data]);

  const cancelCustom = () => { setSpecificOpen(false); setDraft(""); setCustomError(""); };
  const addCustom = () => {
    const result = addCustomInterest(draft, customs);
    setCustomError(result.error);
    if (result.error || !draft.trim()) return;
    if (result.builtin) {
      setIt(current => [...new Set([...current, result.builtin!])]);
      setPreference("avoids", preferences.avoids.filter(t => t !== result.builtin));
    }
    setCustoms(result.customs);
    setDraft("");
    if (result.customs.length >= 5) setSpecificOpen(false);
  };

  const suggested: Tier | null = linked?.tier ?? data?.suggested ?? null;
  const avg: number | null = linked
    ? linked.avg
    : data?.avg_outing_cost ?? null;

  const afterLink = (tier: string) =>
    api(`/api/groups/${id}/me`)
      .then((d) =>
        setLinked({
          tier: tier as Tier,
          avg: d.avg_outing_cost ?? null,
        }),
      )
      .catch(() => setLinked({ tier: tier as Tier, avg: null }));


  return (
    <Page variant="plain">
      <div className={`${inter.className} [&_*]:[font-family:inherit] [&_input::placeholder]:[font-family:inherit] [&_textarea::placeholder]:[font-family:inherit] bg-surface px-6 pt-6 text-indigo`}>
        <BackButton
          href={
            data?.availability?.length
              ? groupHref({ ...group, id })
              : "/groups"
          }
          className="mb-5"
        />
        <h1 className="mb-4 font-[inherit] text-[28px] font-extrabold leading-tight tracking-[-0.5px]">
          My setup
        </h1>

        <div className="space-y-6">
          <section>
            <span className="label font-bold">When are you free?</span>
            <AvailabilityPicker value={av} onChange={setAv} />
            {data?.availability_expired && <p className="mt-2 text-sm text-[#7A1A3F]">Your free times have passed. Pick new ones.</p>}
          </section>

          <section aria-labelledby="interests-heading">
            <h2 id="interests-heading" className="label font-bold">What are you into?</h2>
            <p className="mb-3 text-sm text-muted">Tap once if you like it, twice if you want to skip it.</p>
            <div className="flex flex-wrap gap-2">
              {GROUP_INTERESTS.map(value => {
                const state = interestState(value, it, preferences.avoids);
                return <button
                  key={value}
                  type="button"
                  aria-label={`${interestLabel(value)}, ${state}`}
                  aria-pressed={state !== "clear"}
                  onClick={() => {
                    const next = cycleInterest(value, it, preferences.avoids);
                    setIt(next.likes);
                    setPreference("avoids", next.avoids);
                  }}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold ${state === "into it" ? "border-[#8FB78F] bg-[#8FB78F] text-[#1B3A1E]" : state === "avoid" ? "border-[#F3A5BC] bg-[#F3A5BC] text-[#7A1A3F]" : "border-[#B4CCCF] bg-white text-[#28536B]"}`}
                >
                  {state === "avoid" && <span aria-hidden="true" className="mr-1">×</span>}{interestLabel(value)}
                </button>;
              })}
              {customs.map((custom, index) => <span key={custom.text.toLowerCase()} className={`inline-flex items-center rounded-full border text-sm font-semibold ${custom.state === "into it" ? "border-[#8FB78F] bg-[#8FB78F] text-[#1B3A1E]" : "border-[#F3A5BC] bg-[#F3A5BC] text-[#7A1A3F]"}`}>
                <button type="button" className="rounded-full py-2 pl-4 pr-1" aria-label={`${custom.text}, ${custom.state}, custom`} aria-pressed="true" onClick={() => { setCustoms(cycleCustomInterest(customs, index)); setCustomError(""); }}>
                  {custom.state === "avoid" && <span aria-hidden="true" className="mr-1">×</span>}{custom.text}
                </button>
                <button type="button" className="rounded-full px-2 py-2 text-xs" aria-label={`Remove ${custom.text}`} onClick={() => { setCustoms(customs.filter((_, i) => i !== index)); setCustomError(""); }}><span aria-hidden="true">×</span></button>
              </span>)}
              <button type="button" disabled={customs.length >= 5} className="rounded-full border-2 border-dashed border-[#6F98A2] bg-white px-[15px] py-[7px] text-sm font-semibold disabled:opacity-50" aria-expanded={specificOpen} aria-controls="interest-specifics" onClick={() => specificOpen ? cancelCustom() : setSpecificOpen(true)}>
                {customs.length >= 5 ? "Limit reached" : <><span aria-hidden="true">+</span> Add something specific</>}
              </button>
            </div>
            {specificOpen && <div id="interest-specifics" className="mt-2 flex items-center gap-2">
              <label className="sr-only" htmlFor="specific-interest">Something specific (optional)</label>
              <input id="specific-interest" autoFocus className={inputStyle} style={{ fontFamily: "inherit" }} maxLength={30} placeholder="a band, a dish, a place you've been wanting to try" value={draft} onChange={e => { setDraft(e.target.value); setCustomError(""); }} onKeyDown={e => {
                if (e.key === "Escape") { e.preventDefault(); cancelCustom(); }
                if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); addCustom(); }
              }} />
              <button type="button" className="rounded-full bg-[#8FB78F] px-4 py-2 text-sm font-semibold text-[#1B3A1E]" onClick={addCustom}>Add</button>
            </div>}
            {(customError || customs.length >= 5) && <p role="status" className="mt-2 text-sm text-[#7A1A3F]">{customError || "You can add up to 5 custom interests."}</p>}
          </section>

          <section>
            <span className="label font-bold">Max distance: {mi} mi</span>
            <input
              type="range"
              min={1}
              max={30}
              value={mi}
              onChange={(e) => setMi(+e.target.value)}
              className="w-full accent-[var(--sage)]"
            />
          </section>

          <section aria-label="Comfort level">
            <span className="label font-bold">Comfort level for this group</span>
            <ComfortPicker
              suggested={suggested}
              avg={avg}
              picked={picked}
              onPick={setPicked}
            />
            {data && !suggested && (
              <div className="mt-3">
                <LinkBank onLinked={afterLink} />
              </div>
            )}
            <p className="mt-2 text-xs text-muted">
              Only you see this. The group just uses its lowest level.
            </p>
          </section>

          {data && !av.length && (
            <p className="text-sm text-muted">
              Pick at least one time you're free.
            </p>
          )}

          <Err msg={err} />
          {extrasUnavailable && <p role="status" className="text-sm text-muted">Your setup is saved. The new optional preferences cannot be saved yet. <button type="button" className="font-bold underline" onClick={() => r.push(`/groups/${id}`)}>Continue to group</button></p>}

          <button
            className="btn"
            disabled={!data || !av.length}
            onClick={() =>
              api(`/api/groups/${id}/me`, "PUT", {
                availability: av,
                interests: it.filter(i => !preferences.avoids.some(avoid => avoid === i)),
                max_distance_mi: mi,
                comfort_tier: picked,
                preferences: saveInterestChoices(preferences, customs),
              })
                .then(async result => {
                  if (result.preferencesSaved === false) { setExtrasUnavailable(true); return; }
                  const saved = await api(`/api/groups/${id}`);
                  r.push(groupHref({ ...saved, id }));
                })
                .catch((e) => setErr(e.message))
            }
          >
            Save
          </button>
        </div>
      </div>
    </Page>
  );
}
