import { timeNotice, type TimeMatch } from '@/lib/availability';
export function TimeNotice({ match }: { match?: TimeMatch | null }) {
  const text = timeNotice(match);
  return text ? <p className="my-2 rounded-xl bg-[#F3A5BC] px-3 py-2 text-sm text-[#7A1A3F]">{text}</p> : null;
}
