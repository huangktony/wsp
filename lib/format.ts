// Pure display helpers for the Budget screen.

/** "$1,234" for whole dollars, "$18.33" when there are cents. Always positive; callers add the sign. */
export function formatMoney(n: number): string {
  const v = Math.abs(Math.round(n * 100) / 100);
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** "-$16.40" or "+$24". */
export function formatSigned(n: number): string {
  return `${n < 0 ? "-" : n > 0 ? "+" : ""}${formatMoney(n)}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const parts = (d: string) => d.split("-").map(Number) as [number, number, number];
const dayNumber = (d: string) => { const [y, m, dd] = parts(d); return Date.UTC(y, m - 1, dd) / 864e5; };

/**
 * Today / Yesterday / the weekday within the last week / "Oct 12" otherwise. `today` comes from the server (UTC, the same
 * day the data was windowed on), so the label cannot disagree with the numbers because of the viewer's time zone.
 */
export function relativeDay(date: string, today: string): string {
  const diff = dayNumber(today) - dayNumber(date);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  const [y, m, d] = parts(date);
  if (diff >= 2 && diff <= 6) return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${MONTHS[m - 1]} ${d}`;
}
