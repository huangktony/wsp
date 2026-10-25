/** Shared by the browser and join route; no server-only crypto imports. */
export function formatInviteSuffix(raw: string): string {
  const compact = raw.replace(/[^a-z0-9]/gi, "").toUpperCase();
  if ("WSP".startsWith(compact)) return "";
  return (compact.startsWith("WSP") ? compact.slice(3) : compact).slice(0, 4);
}

export function buildInviteCode(suffix: string): string {
  return `WSP-${suffix.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 4)}`;
}

export const isCompleteInviteCode = (code: string) => /^WSP-[A-Z0-9]{3,4}$/.test(code);

/** Normalize aliases without silently truncating an overlong submitted code. */
export function normalizeInviteCode(raw: string): string | null {
  const compact = raw.replace(/[^a-z0-9]/gi, "").toUpperCase();
  const suffix = compact.startsWith("WSP") ? compact.slice(3) : compact;
  return /^[A-Z0-9]{3,4}$/.test(suffix) ? `WSP-${suffix}` : null;
}
