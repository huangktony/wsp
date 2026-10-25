// Pure comfort-level rules (no I/O): what a member's level is for a group, what the group's cap is, what the setup screen says.
import { z } from "zod";
import { SetupPreferences } from "./setupPreferences";
import { editableAvailability, selectableDay } from "./availability";
import { rank } from "./price";
import { isTier, lowestTier, tierLabel, type Tier } from "./tiers";

/** A member's level for a group: their own pick if they made one, else the suggestion from their spending. null if neither. */
export function effectiveTier(override: string | null | undefined, suggested: string | null | undefined): Tier | null {
  if (isTier(override)) return override;
  return isTier(suggested) ? suggested : null;
}

/** The group's cap is the LOWEST effective level. Members with no level at all are ignored; with none left it is "$$". */
export function groupTierFrom(members: { comfort_tier: string | null; budget_tier: string | null }[]): Tier {
  return lowestTier(members.map((m) => effectiveTier(m.comfort_tier, m.budget_tier)));
}

/** PUT /api/groups/[id]/me. comfort_tier is optional: absent leaves the pick alone, null clears it. */
export const ComfortPick = z.enum(["$", "$$", "$$$"]).nullable();
export const MeBody = z.object({
  availability: z.array(z.string()).max(124).transform(v => editableAvailability(v)).refine(v => v.length > 0 && v.every(s => selectableDay(s.split(" ")[0]))), // setup can't be skipped: at least one free time
  interests: z.array(z.string()).max(12),
  max_distance_mi: z.number().int().min(1).max(100),
  comfort_tier: ComfortPick.optional(),
  preferences: SetupPreferences.optional(),
});

export type CaptionKind = "none" | "same" | "lower" | "higher";
export type Caption = { kind: CaptionKind; text: string; /** the part the screen shows in bold */ bold?: string; showReset: boolean };

/** The sentence under the gauge. `picked` is the member's own pick for this group (null = using the suggestion). */
export function comfortCaption(p: { suggested: Tier | null; picked: Tier | null; avg: number | null }): Caption {
  const { suggested, picked, avg } = p;
  if (!suggested) return { kind: "none", text: "Link a demo account for a suggestion, or pick a level.", showReset: false };
  if (!picked || picked === suggested) {
    // "about" plus cents reads oddly, so the caption rounds to whole dollars (Budget keeps the cents).
    const bold = avg == null ? undefined : `$${Math.round(avg)} per outing`;
    const text = bold
      ? `You usually spend about ${bold}, so WSP looks for places ${tierLabel(suggested)}.`
      : `WSP looks for places ${tierLabel(suggested)}.`;
    return { kind: "same", text, bold, showReset: false };
  }
  const above = rank(picked) > rank(suggested);
  return {
    kind: above ? "higher" : "lower",
    text: `Your spending suggests ${tierLabel(suggested)}. You picked ${tierLabel(picked)} for this group.${above ? " That's above what you usually spend." : ""}`,
    showReset: true,
  };
}
