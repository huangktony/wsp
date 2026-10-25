// Shared group preference validation and chip behavior. Availability alone completes setup.
import { z } from "zod";
export const GROUP_INTERESTS = ["food", "coffee", "outdoors", "entertainment", "music", "games", "sports", "art & museums", "nightlife", "shopping", "movies", "fitness"] as const;
export type Interest = typeof GROUP_INTERESTS[number];
export const interestLabel = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
export const cleanPreference = (value: string, max: number) => value.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").trim().slice(0, max);
export const SetupPreferences = z.object({
  interests_text: z.string().max(2000).transform(v => cleanPreference(v, 2000)).default(""),
  avoids: z.array(z.string().max(200).transform(v => sanitizeCustom(v))).max(100).transform(v => [...new Map(v.filter(Boolean).map(t => [t.toLowerCase(), t])).values()]).default([]),
  // Legacy notes are read as chips and folded into the current fields on save.
  avoids_text: z.string().max(120).transform(v => cleanPreference(v, 120)).default(""),
  legacy_interests_text: z.string().max(200).transform(v => cleanPreference(v, 200)).default(""),
});
export type Preferences = z.infer<typeof SetupPreferences>;
export function readPreferences(value: unknown): Preferences {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const text = (key: string, max: number) => typeof raw[key] === "string" ? cleanPreference(raw[key], max) : "";
  const interests = text("interests_text", 2000);
  const avoids = Array.isArray(raw.avoids) ? raw.avoids : [];
  return SetupPreferences.parse({
    interests_text: interests,
    legacy_interests_text: text("legacy_interests_text", 200),
    avoids_text: text("avoids_text", 120),
    avoids: avoids.filter((v): v is string => typeof v === "string").map(v => sanitizeCustom(v).slice(0, 200)),
  });
}
export type InterestState = "clear" | "into it" | "avoid";
export function interestState(value: string, likes: string[], avoids: string[]): InterestState {
  return avoids.includes(value) ? "avoid" : likes.includes(value) ? "into it" : "clear";
}
export function cycleInterest(value: string, likes: string[], avoids: string[]) {
  const state = interestState(value, likes, avoids);
  return {
    likes: state === "clear" ? [...likes.filter(i => i !== value), value] : likes.filter(i => i !== value),
    avoids: state === "into it" ? [...avoids.filter(i => i !== value), value] : avoids.filter(i => i !== value),
  };
}

export type CustomInterest = { text: string; state: "into it" | "avoid" };
export function sanitizeCustom(value: string) {
  return value.replace(/[\u0000-\u001f\u007f-\u009f<>]/g, "").replace(/\s+/g, " ").trim();
}
const key = (value: string) => sanitizeCustom(value).toLowerCase();
export function builtinInterest(value: string): Interest | undefined {
  return GROUP_INTERESTS.find(tag => tag === key(value));
}
// JSON keeps commas inside new labels lossless; older plain strings are comma-separated.
export function customTexts(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every(v => typeof v === "string")) return parsed;
  } catch { /* Legacy free text. */ }
  return value.split(",");
}
export function restoreInterestChoices(likes: string[], preferences: Preferences) {
  const selected = new Set(likes);
  const avoids = new Set<string>();
  const customs = new Map<string, CustomInterest>();
  const restore = (raw: string, state: CustomInterest["state"]) => {
    const text = sanitizeCustom(raw);
    if (!text) return;
    const tag = builtinInterest(text);
    if (tag) {
      if (state === "avoid") { selected.delete(tag); avoids.add(tag); }
      else selected.add(tag);
    } else customs.set(key(text), { text, state });
  };
  // Grandfather legacy notes longer than 30 characters or more than five entries:
  // show all of them rather than silently dropping saved data; new additions stay limited.
  [...customTexts(preferences.interests_text), ...customTexts(preferences.legacy_interests_text)].forEach(t => restore(t, "into it"));
  [...customTexts(preferences.avoids_text), ...preferences.avoids].forEach(t => restore(t, "avoid"));
  return { likes: [...selected], avoids: [...avoids], customs: [...customs.values()] };
}
export function addCustomInterest(raw: string, customs: CustomInterest[]) {
  const text = sanitizeCustom(raw);
  if (!text) return { error: "", customs };
  const builtin = builtinInterest(text);
  if (builtin) return { error: "", customs, builtin };
  if (customs.some(c => key(c.text) === key(text))) return { error: "That interest is already added.", customs };
  if (customs.length >= 5) return { error: "You can add up to 5 custom interests.", customs };
  if (text.length > 30) return { error: "Use 30 characters or fewer.", customs };
  return { error: "", customs: [...customs, { text, state: "into it" as const }] };
}
export function cycleCustomInterest(customs: CustomInterest[], index: number): CustomInterest[] {
  return customs.flatMap((c, i) => i !== index ? [c] : c.state === "into it" ? [{ ...c, state: "avoid" as const }] : []);
}
export function saveInterestChoices(preferences: Preferences, customs: CustomInterest[]): Preferences {
  return { ...preferences,
    interests_text: JSON.stringify(customs.filter(c => c.state === "into it").map(c => c.text)),
    legacy_interests_text: "",
    avoids_text: "",
    avoids: [...preferences.avoids.filter(t => builtinInterest(t)), ...customs.filter(c => c.state === "avoid").map(c => c.text)],
  };
}
