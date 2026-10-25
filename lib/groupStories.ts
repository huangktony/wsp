export type StoryGroup = {
  id: number; round_status?: string | null; has_plans?: boolean;
  round_started_at?: string | null; last_activity_at?: string | null;
  my_voted?: boolean; can_vote?: boolean;
};
export const hasOpenVote = (group: StoryGroup) => group.round_status === "voting" && group.has_plans === true;
const timestamp = (value?: string | null) => value ? Date.parse(value) || 0 : 0;
export function splitGroupStories<T extends StoryGroup>(groups: T[]) {
  return {
    open: groups.filter(hasOpenVote).sort((a, b) => timestamp(b.round_started_at) - timestamp(a.round_started_at) || b.id - a.id),
    other: groups.filter(group => !hasOpenVote(group)).sort((a, b) => timestamp(b.last_activity_at) - timestamp(a.last_activity_at) || b.id - a.id),
  };
}
const colors = ["bg-[#F3A5BC] text-[#7A1A3F]", "bg-[#FFC49B] text-[#28536B]", "bg-[#CBE6C7] text-[#28536B]"] as const;
export const groupStoryColor = (id: number) => colors[((id % colors.length) + colors.length) % colors.length];
export const needsVoteBadge = (group: StoryGroup) => hasOpenVote(group) && group.can_vote === true && !group.my_voted;
export const groupStoryLabel = (group: StoryGroup & { name: string }) => `${group.name}, voting open, ${group.my_voted ? "you've voted" : group.can_vote ? "you haven't voted" : "you can't vote yet"}`;
