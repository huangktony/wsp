import { z } from "zod";
import { q } from "@/lib/db";

/** The client resizes to a small JPEG; reject anything else or anything unreasonably large. */
const MAX_AVATAR_CHARS = 150_000;
export const AVATAR_PATTERN = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/;

export const ProfileBody = z.object({
  name: z.string().trim().min(1, "name can't be empty").max(60, "name is too long").optional(),
  avatar: z.string().max(MAX_AVATAR_CHARS).regex(AVATAR_PATTERN, "avatar must be a JPEG image").nullable().optional(),
}).refine((b) => b.name !== undefined || b.avatar !== undefined, "nothing to update");

/** Updates only the fields present. avatar: null removes the photo. */
export async function updateProfile(userId: number, patch: z.infer<typeof ProfileBody>) {
  await q(
    "update users set name=coalesce($1,name), avatar=case when $2::boolean then $3 else avatar end where id=$4",
    [patch.name ?? null, patch.avatar !== undefined, patch.avatar ?? null, userId]);
}
