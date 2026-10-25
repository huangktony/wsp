// TODO(verify): current Gemini model name and responseSchema option against docs.
import { z } from "zod";
import { MissingCityError, type Place } from "./serpapi";
import { rank } from "./price";
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

/**
 * Deterministic fallback built from the candidate places. HARD RULE: only places at or below the group tier are used,
 * so there is no "cheapest" fallback and no plan above budget. If nothing fits, returns [].
 * A plan's level is its most expensive stop; its cost is the sum of its stop costs.
 */
const VIBE: Record<number, string> = { 1: "A short, low-key option.", 2: "A classic two-stop outing.", 3: "The bigger outing." };
const SHORT = (n: string) => n.replace(/^The /, "").split(/\s+/).slice(0, 2).join(" ").replace(/'s$/, "");

export function mockPlans(places: Place[], slot: string, tier = "$$"): PlanDraft[] {
  const pool = places.filter((p) => rank(p.price) <= rank(tier));
  if (!pool.length) return [];
  const used = new Set<string>();
  const build = (start: number, maxStops: number): PlanDraft | null => {
    const picked: Place[] = [];
    // Prefer places no other plan used, so the 3 plans really differ.
    for (const fresh of [true, false]) {
      for (let i = 0; i < pool.length && picked.length < maxStops; i++) {
        const p = pool[(start + i) % pool.length];
        if ((fresh && used.has(p.name)) || picked.some((x) => x.name === p.name) || picked.some((x) => x.category === p.category)) continue;
        picked.push(p);
      }
    }
    if (!picked.length) return null;
    picked.forEach((p) => used.add(p.name));
    const times = stopTimes(slot, picked.length);
    const stops = picked.map((p, i) => ({ place: p.name, time: times[i] }));
    // Only claim "inside the budget" when every stop really is.
    const inside = picked.every((p) => rank(p.price) <= rank(tier));
    return {
      title: picked.length === 1 ? picked[0].name : picked.map((p) => SHORT(p.name)).join(" + "),
      summary: `${picked.map((p) => p.name).join(", then ")} on ${slot}.`,
      stops,
      est_cost_per_person: picked.reduce((sum, p) => sum + p.cost, 0),
      why_fits: `${VIBE[picked.length] ?? VIBE[3]} ${picked.length > 1 ? "Mixes " + [...new Set(picked.map((p) => p.category))].join(" and ") : "Keeps it to one " + picked[0].category + " stop"}${inside ? `, and stays inside the ${tier} group budget` : ""}.`,
    };
  };
  const all = [build(0, 2), build(1, 1), build(2, 3)].filter((d): d is PlanDraft => !!d);
  // With few places left (e.g. after a veto round) plans can repeat. Keep only distinct ones.
  const seen = new Set<string>();
  return all.filter((d) => { const k = d.stops.map((x) => x.place).sort().join("|"); return !seen.has(k) && !!seen.add(k); });
}

/** True only if every stop is a known candidate place at or below the group tier (guards the Gemini path too). */
export function withinBudget(drafts: PlanDraft[], places: Place[], tier: string): boolean {
  const byName = new Map(places.map((p) => [p.name.toLowerCase(), p]));
  return drafts.every((d) => d.stops.every((s) => { const p = byName.get(s.place.toLowerCase()); return !!p && rank(p.price) <= rank(tier); }));
}

export async function generatePlans(ctx: { city: string; slot: string; tier: string; interests: string[]; places: Place[]; maxDistanceMi?: number; avoid?: string[] }): Promise<PlanDraft[]> {
  if (!ctx.city?.trim()) throw new MissingCityError();
  if (!ctx.places.length) return [];
  if (process.env.USE_MOCKS !== "true" && process.env.GEMINI_API_KEY) {
    const prompt = `Plan 3 distinct group hangouts in ${ctx.city} for ${ctx.slot}. Max budget tier ${ctx.tier} (never exceed). Requested radius ${ctx.maxDistanceMi ?? "unspecified"} miles; any explicitly disclosed radius extension is in the candidates. Shared interests: ${ctx.interests.join(", ") || "any"}. Use ONLY these places (price tier $=~12, $$=~25, $$$=~50 per person, "cost" is the estimated per-person cost): ${JSON.stringify(ctx.places)}. Each plan has ordered stops with times, an estimated cost per person, and why it fits (one or two sentences naming the shared time, interests or budget).${ctx.avoid?.length ? ` The group vetoed these places last time, do not use them: ${ctx.avoid.join(", ")}.` : ""}`;
    for (let i = 0; i < 2; i++) {
      try {
        const drafts = await callGemini(prompt);
        if (withinBudget(drafts, ctx.places, ctx.tier)) return drafts;
      } catch {}
    }
  }
  return mockPlans(ctx.places, ctx.slot, ctx.tier);
}
