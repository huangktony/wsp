// Pure display helpers for Travel screens. Dates are "YYYY-MM-DD" strings, never time-zone converted.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const parse = (value: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m && +m[2] >= 1 && +m[2] <= 12 ? { y: +m[1], m: +m[2], d: +m[3] } : null;
};

/**
 * "Nov 24 – 27", "Nov 28 – Dec 2". The year is shown only when it is not the current year: "Nov 24 – 27, 2027",
 * or on both ends when the trip spans two years ("Dec 28, 2026 – Jan 3, 2027"). Unreadable input is shown as given.
 */
export function formatTripDates(depart: string, ret: string, now = new Date()): string {
  const a = parse(depart), b = parse(ret);
  if (!a || !b) return `${depart} – ${ret}`;
  const thisYear = now.getUTCFullYear();
  const day = (x: typeof a) => `${MONTHS[x.m - 1]} ${x.d}`;
  if (a.y !== b.y) return `${day(a)}, ${a.y} – ${day(b)}, ${b.y}`;
  const year = a.y === thisYear ? '' : `, ${a.y}`;
  if (a.m === b.m && a.d === b.d) return `${day(a)}${year}`;
  return `${day(a)} – ${a.m === b.m ? b.d : day(b)}${year}`;
}

/** Minutes as "10h 23m", "1h", "45m". Unknown or invalid is an empty string. */
export function formatDuration(minutes: number | null | undefined): string {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0) return '';
  const total = Math.round(minutes), h = Math.floor(total / 60), m = total % 60;
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** "Oct 25, 2:56 AM": month, day and time, no seconds. Unreadable input is an empty string. */
export function formatFareTime(iso: string | null | undefined, timeZone?: string): string {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return '';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone })
    .format(t).replace(/[\u202f\u00a0]/g, ' '); // newer ICU puts a narrow no-break space before AM/PM
}
