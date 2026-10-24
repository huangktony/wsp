// Turns an availability slot like "Sat afternoon" into times. Safe on client and server.
const DAYS: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// Start hour and length in hours for each part of the day.
const PARTS: Record<string, [number, number]> = { morning: [10, 3], lunch: [12, 2], afternoon: [14, 3], evening: [18, 3], late: [21, 3] };

export function parseSlot(slot: string | null | undefined) {
  const [d = "sat", p = "evening"] = (slot ?? "Sat evening").toLowerCase().split(/\s+/);
  const day = DAYS[d.slice(0, 3)] ?? 6;
  const [start, hours] = PARTS[p] ?? PARTS.evening;
  return { day, dayName: DAY_NAMES[day], part: PARTS[p] ? p : "evening", start, hours };
}

/** Stop times for a slot, e.g. ["2:00 PM", "3:30 PM", "5:00 PM"]. */
export function stopTimes(slot: string, n = 3): string[] {
  const { start, hours } = parseSlot(slot);
  const step = n > 1 ? (hours * 60) / n : 0;
  return Array.from({ length: n }, (_, i) => fmtTime(start * 60 + Math.round((i * step) / 15) * 15));
}

export function fmtTime(mins: number) {
  const h = Math.floor(mins / 60) % 24, m = mins % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Next date (on or after `from`) that falls on the slot's weekday, with start and end times. */
export function slotDate(slot: string, from: Date | string = new Date()) {
  const { day, start, hours } = parseSlot(slot);
  const d = new Date(from);
  d.setHours(start, 0, 0, 0);
  d.setDate(d.getDate() + ((day - d.getDay() + 7) % 7));
  if (d.getTime() < new Date(from).getTime() - 12 * 3600e3) d.setDate(d.getDate() + 7);
  return { start: d, end: new Date(d.getTime() + hours * 3600e3) };
}

/** "Saturday, Oct 31 · 2:00 PM–5:00 PM" */
export function slotLabel(slot: string, from?: Date | string) {
  const { start, end } = slotDate(slot, from);
  const date = start.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const t = (x: Date) => fmtTime(x.getHours() * 60 + x.getMinutes());
  return `${date} · ${t(start)}–${t(end)}`;
}
