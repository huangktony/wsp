/** Shared by the browser and join routes; no server-only crypto imports. */

/** A fixed prefix, then min to max characters from `chars` (one character class, upper case). */
export type InviteCodeSpec = { prefix: string; min: number; max: number; chars: RegExp };
/** Hangout: WSP- plus 3 or 4 letters or digits. This is the default everywhere, so existing callers are unchanged. */
export const HANGOUT_CODE: InviteCodeSpec = { prefix: "WSP", min: 3, max: 4, chars: /[A-Z0-9]/ };
/** Travel: TRIP- plus exactly 12 hex characters (what the Travel join route accepts). */
export const TRAVEL_CODE: InviteCodeSpec = { prefix: "TRIP", min: 12, max: 12, chars: /[A-F0-9]/ };

const compact = (raw: string) => raw.replace(/[^a-z0-9]/gi, "").toUpperCase();
const keep = (text: string, spec: InviteCodeSpec) => [...text].filter(ch => spec.chars.test(ch)).join("");

export function formatInviteSuffix(raw: string, spec: InviteCodeSpec = HANGOUT_CODE): string {
  const text = compact(raw);
  if (spec.prefix.startsWith(text)) return "";
  return keep(text.startsWith(spec.prefix) ? text.slice(spec.prefix.length) : text, spec).slice(0, spec.max);
}

export function buildInviteCode(suffix: string, spec: InviteCodeSpec = HANGOUT_CODE): string {
  return `${spec.prefix}-${keep(compact(suffix), spec).slice(0, spec.max)}`;
}

export const isCompleteInviteCode = (code: string, spec: InviteCodeSpec = HANGOUT_CODE) =>
  new RegExp(`^${spec.prefix}-${spec.chars.source}{${spec.min},${spec.max}}$`).test(code);

/** Normalize aliases without silently truncating an overlong submitted code. */
export function normalizeInviteCode(raw: string, spec: InviteCodeSpec = HANGOUT_CODE): string | null {
  const text = compact(raw);
  const suffix = text.startsWith(spec.prefix) ? text.slice(spec.prefix.length) : text;
  return new RegExp(`^${spec.chars.source}{${spec.min},${spec.max}}$`).test(suffix) ? `${spec.prefix}-${suffix}` : null;
}

export type InviteInputResult = { code: string; complete: boolean; pending: string };

/**
 * One keystroke or paste in the input that sits after the fixed prefix. `suffix` is what is currently shown in the box and
 * `pending` is prefix letters typed so far and swallowed, so typing W, S, P (or T, R, I, P) one at a time leaves the box empty.
 * A paste is taken whole, so a full code (with or without the prefix, any case) fills the box.
 */
export function applyInviteInput(spec: InviteCodeSpec, state: { suffix: string; pending: string }, raw: string, pasted = false): InviteInputResult {
  const text = compact(raw);
  const candidate = !pasted && !state.suffix ? state.pending + text : text;
  const pending = candidate && candidate.length < spec.prefix.length && spec.prefix.startsWith(candidate) ? candidate : "";
  const code = buildInviteCode(formatInviteSuffix(candidate, spec), spec);
  return { code, complete: isCompleteInviteCode(code, spec), pending };
}
