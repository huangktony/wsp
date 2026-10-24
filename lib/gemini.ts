// TODO(verify): current Gemini model name and responseSchema option against docs.
import { z } from "zod";
import type { Place } from "./serpapi";
import { estCost } from "./serpapi";

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
const TIMES = ["5:30 PM", "7:30 PM", "9:30 PM"];

export function mockPlans(places: Place[], slot: string, tier = "$$"): PlanDraft[] {
  const pool = places.length ? places : [{ name: "Local spot", price: "$" as const, category: "food", rating: 4, address: "" }];
  const build = (title: string, start: number, maxStops: number): PlanDraft => {
    const stops: { place: string; time: string }[] = [];
    let cost = 0;
    for (let i = 0; i < pool.length && stops.length < maxStops; i++) {
      const p = pool[(start + i) % pool.length];
      const c = estCost(p.price);
      if (stops.some((s) => s.place === p.name) || cost + c > (CAP[tier] ?? 40)) continue;
      stops.push({ place: p.name, time: TIMES[stops.length] });
      cost += c;
    }
    if (!stops.length) {
      const cheapest = [...pool].sort((a, b) => estCost(a.price) - estCost(b.price))[0];
      stops.push({ place: cheapest.name, time: TIMES[0] });
      cost = estCost(cheapest.price);
    }
    return { title, summary: `${stops.map((s) => s.place).join(", then ")} on ${slot}.`, stops, est_cost_per_person: cost, why_fits: `Fits the ${tier} group budget and the group's shared interests.` };
  };
  return [build("Easy night out", 0, 2), build("Low-key hangout", 1, 1), build("Big night", 2, 3)];
}

export async function generatePlans(ctx: { city: string; slot: string; tier: string; interests: string[]; places: Place[] }): Promise<PlanDraft[]> {
  if (process.env.USE_MOCKS !== "true" && process.env.GEMINI_API_KEY) {
    const prompt = `Plan 3 distinct group hangouts in ${ctx.city} for ${ctx.slot}. Max budget tier ${ctx.tier} (never exceed). Shared interests: ${ctx.interests.join(", ") || "any"}. Use ONLY these places (price tier $=~12, $$=~25, $$$=~50 per person): ${JSON.stringify(ctx.places)}. Each plan has ordered stops with times, an estimated cost per person, and why it fits.`;
    for (let i = 0; i < 2; i++) {
      try { return await callGemini(prompt); } catch {}
    }
  }
  return mockPlans(ctx.places, ctx.slot, ctx.tier);
}
