// Pure helpers for recording a hangout's up-front bill on the payer's Nessie account.

/** Description of the one purchase for a round. The marker lets a retry find it instead of recording the bill twice. */
export const hangoutDescription = (title: string, roundId: number) => `${title} (WSP round ${roundId})`;

/** True if the account already has the hangout purchase for this round. */
export const hasHangout = (existing: { description?: string }[], roundId: number) =>
  existing.some((p) => (p.description ?? "").endsWith(`(WSP round ${roundId})`));

export const HANGOUT_MERCHANT = "WSP Hangout";
export const HANGOUT_CATEGORY = "hangout";
