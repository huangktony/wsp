import { randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// Uniqueness is enforced by the create route's atomic insert, not a preflight read.
export function generateInviteCode(length: 3 | 4 = 3): string {
  return `WSP-${Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")}`;
}
