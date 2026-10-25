// Shared phase/navigation rules for the real Travel flow. Reading a phase never starts a search.
export type TravelPhase = 'setup' | 'ready' | 'finding' | 'voting' | 'final' | 'failed' | 'stale' | 'expired' | 'vetoed';
export const PHASE_LABEL: Record<TravelPhase, string> = {
  setup: 'Getting ready', ready: 'Ready to compare', finding: 'Finding flights', voting: 'Voting open',
  final: 'Meeting place picked', failed: 'Search needs attention', stale: 'Trip changed', expired: 'Fares need refreshing', vetoed: 'Choose new options',
};
export type ComparisonPhase = { status: string; id?: number; expired?: boolean } | null | undefined;
export function travelPhase(comparison: ComparisonPhase, ready: number, members: number): TravelPhase {
  if (comparison?.status === 'final') return 'final';
  if (comparison?.status === 'stale') return 'stale';
  if (comparison?.status === 'generating') return 'finding';
  if (comparison?.status === 'failed') return 'failed';
  if (comparison?.status === 'vetoed') return 'vetoed';
  if (comparison?.status === 'voting') return comparison.expired ? 'expired' : 'voting';
  return members > 0 && ready === members ? 'ready' : 'setup';
}
export function travelEntry(id: number | string, setupDone: boolean) {
  return `/travel/${id}${setupDone ? '' : '/setup'}`;
}
export function stageLink(id: number | string, phase: TravelPhase) {
  return `/travel/${id}/${phase === 'final' ? 'final' : phase === 'voting' ? 'plans' : 'finding'}`;
}
export function findingDestination(id: number | string, comparison: ComparisonPhase, observedId: number | null) {
  if (!observedId || comparison?.id !== observedId) return null;
  if (comparison?.status === 'final') return `/travel/${id}/final`;
  if (comparison?.status === 'voting' && !comparison.expired) return `/travel/${id}/plans`;
  return null;
}
