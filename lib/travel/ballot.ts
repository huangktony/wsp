import { chooseWinner, isRemoved, majority, shouldClose } from '../votingRules';
import type { Option, Ballot } from './core';

export type BallotState = { deadline: string; confirmed: number[]; redraw: number[]; finalConfirmedAt: string | null };
const ids = (value: unknown): number[] => Array.isArray(value)
  ? [...new Set(value.filter((id): id is number => Number.isSafeInteger(id) && id > 0))] : [];
export function ballotState(envelope: unknown, createdAt: Date | string): BallotState {
  const raw = envelope && typeof envelope === 'object' && !Array.isArray(envelope) ? (envelope as any).ballot : null;
  const fallback = new Date(new Date(createdAt).getTime() + 24 * 60 * 60 * 1000).toISOString();
  return {
    deadline: typeof raw?.deadline === 'string' && Number.isFinite(Date.parse(raw.deadline)) ? raw.deadline : fallback,
    confirmed: ids(raw?.confirmed), redraw: ids(raw?.redraw),
    finalConfirmedAt: typeof raw?.finalConfirmedAt === 'string' && Number.isFinite(Date.parse(raw.finalConfirmedAt)) ? raw.finalConfirmedAt : null,
  };
}
export function ballotProgress(options: Option[], votes: Ballot[], memberIds: number[], state: BallotState, uid?: number) {
  const eligible = votes.filter(v => memberIds.includes(v.userId));
  const tallies = options.filter(o => o.complete && o.total !== null).map(o => ({
    id: o.id, cost: o.total!, approves: eligible.filter(v => v.optionId === o.id && v.value === 'approve').length,
    vetoes: eligible.filter(v => v.optionId === o.id && v.value === 'veto').length,
  }));
  const removedOptionIds = tallies.filter(t => isRemoved(t.vetoes, memberIds.length)).map(t => t.id);
  const remaining = tallies.filter(t => !removedOptionIds.includes(t.id));
  const confirmed = state.confirmed.filter(id => memberIds.includes(id));
  const myConfirmed = uid !== undefined && confirmed.includes(uid);
  return {
    tallies, removedOptionIds, remaining: remaining.length, confirmed: confirmed.length, myConfirmed,
    canConfirm: uid !== undefined && memberIds.includes(uid) && !myConfirmed && remaining.length > 0 && remaining.every(t => eligible.some(v => v.userId === uid && v.optionId === t.id)),
    winner: chooseWinner(tallies, memberIds.length),
  };
}
export { majority, shouldClose };
