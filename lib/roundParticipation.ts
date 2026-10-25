/** Versioned inclusion flags live in the existing search_settings JSON snapshot.
 * Its length is the group size at creation; old snapshots have no flags. */
export type InclusionEntry = { user_id: number; included?: boolean };
export type InclusionRound = { status?: string; search_settings?: InclusionEntry[] | null };
export type InclusionMember = { id: number; name: string; setup_done: boolean };
export const VOTE_SETUP_MESSAGE = "Make your setup to vote";

export function includedIds(round: InclusionRound | null | undefined): number[] | null {
  const saved = round?.search_settings;
  return saved?.some(m => typeof m.included === "boolean")
    ? saved.filter(m => m.included === true).map(m => m.user_id) : null;
}
export function includedInRound(round: InclusionRound | null | undefined, id: number) {
  const ids = includedIds(round);
  return ids === null || ids.includes(id);
}
export function roundInclusion(round: InclusionRound | null, members: InclusionMember[], me?: number) {
  const ids = includedIds(round);
  const excluded = ids === null ? [] : members.filter(m => !ids.includes(m.id));
  const ready = excluded.filter(m => m.setup_done);
  const names = (list: InclusionMember[]) => list.length > 2 ? `${list.length} members` : list.map(m => m.name.trim().split(/\s+/)[0]).join(" and ");
  const total = ids === null ? members.length : round!.search_settings!.length;
  const included = ids === null ? members.length : ids.length;
  const missing = total - included;
  const leftOut = excluded.length ? `${names(excluded)} ${excluded.length === 1 ? "isn't" : "aren't"} included yet.` : `${missing} ${missing === 1 ? "member wasn't" : "members weren't"} included.`;
  const canRerun = !!round && ["voting", "vetoed"].includes(round.status ?? "") && ready.length > 0;
  return {
    includedMemberIds: ids ?? members.map(m => m.id),
    includedCount: included, totalAtStart: total,
    banner: ids !== null && (missing > 0 || excluded.length > 0) ? `Based on ${included} of ${total} setups. ${leftOut}` : null,
    canVote: members.some(m => m.id === me && m.setup_done && includedInRound(round, m.id)),
    canRerun,
    rerunMessage: canRerun ? `${names(ready)} ${ready.length === 1 ? "has" : "have"} finished setup. Re-run plans to include them.` : null,
  };
}

/** Safe even before search_settings exists; aliases must be source-code constants. */
export function includedVoteSql(round = "r", member = "m.user_id") {
  const entries = `jsonb_array_elements(coalesce(nullif(to_jsonb(${round})->'search_settings','null'::jsonb),'[]'::jsonb))`;
  return `(not exists (select 1 from ${entries} entry where entry ? 'included') or exists (select 1 from ${entries} entry where (entry->>'user_id')::int=${member} and entry->>'included'='true'))`;
}
