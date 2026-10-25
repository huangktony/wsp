"use client";
import { AVATAR_TYPES, MAX_UPLOAD_BYTES } from "./constants";

/** Validates a picked file, then center-crops and shrinks it to a small JPEG data URL. */
export async function resizeAvatar(file: File, size = 192): Promise<string> {
  if (!AVATAR_TYPES.includes(file.type)) throw new Error("Use a JPEG, PNG, WebP or GIF image.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("That photo is over 2MB. Pick a smaller one.");
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error("Couldn't read that image."); });
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.82);
}
