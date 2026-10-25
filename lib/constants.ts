// Plain module (no "use client") so server routes can import it too.
export const INTERESTS = ["food", "coffee", "outdoors", "entertainment"] as const;
export const SLOTS = ["Fri evening", "Sat afternoon", "Sat evening", "Sun afternoon"] as const;

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
