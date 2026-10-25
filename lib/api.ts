import { normalizeAvailability } from "./availability";
import { NextResponse } from "next/server";
import { currentUserId } from "./session";
import { q1 } from "./db";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (msg: string, status = 400) => json({ error: msg }, status);

/** Returns user id or a 401 response. */
export async function requireUser(): Promise<number | NextResponse> {
  const id = await currentUserId();
  return id ?? fail("not signed in", 401);
}
export async function isMember(groupId: number, userId: number) {
  return !!(await q1("select 1 from memberships where group_id=$1 and user_id=$2", [groupId, userId]));
}
/** Setup is done once the member has picked at least one free time. Until then they can't find plans or vote. */
export async function setupDone(groupId: number, userId: number) {
  const row = await q1<{ availability: string[] }>("select availability from memberships where group_id=$1 and user_id=$2", [groupId, userId]);
  return normalizeAvailability(row?.availability).length > 0;
}
