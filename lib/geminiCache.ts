// Server-only durable claims: never retry a model call for the same round/kind,
// even after timeout/crash. Missing migration disables AI without breaking the old flow.
import { q, q1 } from "./db";
export type GenerationKind = "hangout";
export async function claimGeneration(roundId: number, kind: GenerationKind): Promise<boolean> {
  const schema = await q1<{ ready: boolean }>("select exists(select 1 from information_schema.columns where table_schema=current_schema() and table_name='plan_rounds' and column_name='gemini_state') ready");
  if (!schema?.ready) return false;
  const row = await q1("update plan_rounds set gemini_state=coalesce(gemini_state,'{}'::jsonb) || jsonb_build_object($2::text, jsonb_build_object('status','started')) where id=$1 and not (coalesce(gemini_state,'{}'::jsonb) ? $2::text) returning id", [roundId, kind]);
  return !!row;
}
export async function saveGeneration(roundId: number, kind: GenerationKind, result: unknown) {
  await q("update plan_rounds set gemini_state=jsonb_set(gemini_state,array[$2::text],$3::jsonb) where id=$1", [roundId, kind, JSON.stringify({ status: "done", result })]);
}
export async function readGeneration(roundId: number, kind: GenerationKind): Promise<any> {
  const row = await q1<any>("select to_jsonb(r)->'gemini_state' state from plan_rounds r where id=$1", [roundId]);
  return row?.state?.[kind]?.result ?? null;
}
