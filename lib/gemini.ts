// TODO(verify): current Gemini model name and responseSchema option against docs.
import { z } from "zod";
import type { Place } from "./serpapi";
import { estCost } from "./serpapi";
import { stopTimes } from "./slot";

export const PlanSchema = z.object({
  title: z.string(),
  summary: z.string(),
  stops: z.array(z.object({ place: z.string(), time: z.string() })).min(1),
  est_cost_per_person: z.number(),
  why_fits: z.string(),
});
export const PlansSchema = z.object({ plans: z.array(PlanSchema).length(3) });
export type PlanDraft = z.infer<typeof PlanSchema>;

const MODEL = "gemini-2.0-flash";
const responseSchema = {
  type: "OBJECT",
  properties: {
    plans: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" }, summary: { type: "STRING" },
          stops: { type: "ARRAY", items: { type: "OBJECT", properties: { place: { type: "STRING" }, time: { type: "STRING" } }, required: ["place", "time"] } },
          est_cost_per_person: { type: "NUMBER" }, why_fits: { type: "STRING" },
        },
        required: ["title", "summary", "stops", "est_cost_per_person", "why_fits"],
      },
    },
  },
  required: ["plans"],
};

async function callGemini(prompt: string): Promise<PlanDraft[]> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", responseSchema } }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const data = await res.json();
  return PlansSchema.parse(JSON.parse(data.candidates[0].content.parts[0].text)).plans;
}

/** Deterministic fallback built from the candidate places. Total cost per plan stays under the tier cap. */
const CAP: Record<string, number> = { $: 20, $$: 40, $$$: 90 };
const VIBE: Record<number, string> = { 1: "A short, low-key option.", 2: "A classic two-stop outing.", 3: "The bigger outing." };
const SHORT = (n: string) => n.replace(/^The /, "").split(/\s+/).slice(0, 2).join(" ").replace(/'s$/, "");

export function mockPlans(places: Place[], slot: string, tier = "$$"): PlanDraft[] {
  const pool = places.length ? places : [{ name: "Local spot", price: "$" as const, category: "food", rating: 4, address: "" }];
  const used = new Set<string>();
  const build = (start: number, maxStops: number): PlanDraft => {
    const picked: Place[] = [];
    let cost = 0;
    // Prefer places no other plan used, so the 3 plans really differ.
    for (const fresh of [true, false]) {
      for (let i = 0; i < pool.length && picked.length < maxStops; i++) {
        const p = pool[(start + i) % pool.length];
        const c = estCost(p.price);
        if ((fresh && used.has(p.name)) || picked.some((x) => x.name === p.name) || picked.some((x) => x.category === p.category) || cost + c > (CAP[tier] ?? 40)) continue;
        picked.push(p);
        cost += c;
      }
    }
    if (!picked.length) {
      const cheapest = [...pool].sort((a, b) => estCost(a.price) - estCost(b.price))[0];
      picked.push(cheapest);
      cost = estCost(cheapest.price);
    }
    picked.forEach((p) => used.add(p.name));
    const times = stopTimes(slot, picked.length);
    const stops = picked.map((p, i) => ({ place: p.name, time: times[i] }));
    return {
      title: picked.length === 1 ? picked[0].name : picked.map((p) => SHORT(p.name)).join(" + "),
      summary: `${picked.map((p) => p.name).join(", then ")} on ${slot}.`,
      stops,
      est_cost_per_person: cost,
      why_fits: `${VIBE[picked.length] ?? VIBE[3]} ${picked.length > 1 ? "Mixes " + [...new Set(picked.map((p) => p.category))].join(" and ") : "Keeps it to one " + picked[0].category + " stop"}, and stays inside the ${tier} group budget.`,
    };
  };
  const all = [build(0, 2), build(1, 1), build(2, 3)];
  // With few places left (e.g. after a veto round) plans can repeat. Keep only distinct ones.
  const seen = new Set<string>();
  return all.filter((d) => { const k = d.stops.map((x) => x.place).sort().join("|"); return !seen.has(k) && !!seen.add(k); });
}

export async function generatePlans(ctx: { city: string; slot: string; tier: string; interests: string[]; places: Place[]; avoid?: string[] }): Promise<PlanDraft[]> {
  if (process.env.USE_MOCKS !== "true" && process.env.GEMINI_API_KEY) {
    const prompt = `Plan 3 distinct group hangouts in ${ctx.city} for ${ctx.slot}. Max budget tier ${ctx.tier} (never exceed). Shared interests: ${ctx.interests.join(", ") || "any"}. Use ONLY these places (price tier $=~12, $$=~25, $$$=~50 per person): ${JSON.stringify(ctx.places)}. Each plan has ordered stops with times, an estimated cost per person, and why it fits (one or two sentences naming the shared time, interests or budget).${ctx.avoid?.length ? ` The group vetoed these places last time, do not use them: ${ctx.avoid.join(", ")}.` : ""}`;
    for (let i = 0; i < 2; i++) {
      try { return await callGemini(prompt); } catch {}
    }
  }
  return mockPlans(ctx.places, ctx.slot, ctx.tier);
}
