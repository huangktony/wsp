"use client";

import { groupHref } from "@/lib/finding";
import { useFindingRedirect } from "@/lib/useFindingRedirect";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Inter } from "next/font/google";
import { BackButton } from "@/components/BackButton";
import { Page, Err } from "@/components/Page";
import { LinkBank } from "@/components/LinkBank";
import { ComfortPicker } from "@/components/ComfortPicker";
import { api, INTERESTS, SLOTS, toggle, useApi } from "@/lib/client";
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

  useEffect(() => {
    if (data) {
      setAv(data.availability);
      setIt(data.interests);
      setMi(data.max_distance_mi);
      setPicked(data.comfort_tier ?? null);
    }
  }, [data]);

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

  const Chip = ({
    v,
    on,
    click,
  }: {
    v: string;
    on: boolean;
    click: () => void;
  }) => (
    <button
      type="button"
      onClick={click}
      className={`rounded-full border px-4 py-2 text-sm font-semibold capitalize ${
        on ? "border-sage bg-sage text-sageink" : "border-line"
      }`}
    >
      {v}
    </button>
  );

  return (
    <Page variant="plain">
      <div className={`${inter.className} bg-surface px-6 pt-6 text-indigo`}>
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
            <span className="label">When are you free?</span>
            <div className="flex flex-wrap gap-2">
              {SLOTS.map((s) => (
                <Chip
                  key={s}
                  v={s}
                  on={av.includes(s)}
                  click={() => setAv(toggle(av, s))}
                />
              ))}
            </div>
          </section>

          <section>
            <span className="label">Interests</span>
            <div className="flex flex-wrap gap-2">
              {INTERESTS.map((s) => (
                <Chip
                  key={s}
                  v={s}
                  on={it.includes(s)}
                  click={() => setIt(toggle(it, s))}
                />
              ))}
            </div>
          </section>

          <section>
            <span className="label">Max distance: {mi} mi</span>
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
            <span className="label">Comfort level for this group</span>
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

          <button
            className="btn"
            disabled={!data || !av.length}
            onClick={() =>
              api(`/api/groups/${id}/me`, "PUT", {
                availability: av,
                interests: it,
                max_distance_mi: mi,
                comfort_tier: picked,
              })
                .then(() => api(`/api/groups/${id}`))
                .then((saved) => r.push(groupHref({ ...saved, id })))
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
