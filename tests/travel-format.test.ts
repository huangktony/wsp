import test from "node:test";
import assert from "node:assert/strict";
import { formatDuration, formatFareTime, formatTripDates } from "../lib/travel/format";

const NOW = new Date("2026-10-25T12:00:00Z");

test("trip dates in the same month share the month", () => {
  assert.equal(formatTripDates("2026-11-24", "2026-11-27", NOW), "Nov 24 – 27");
  assert.equal(formatTripDates("2026-11-01", "2026-11-30", NOW), "Nov 1 – 30");
});

test("trip dates that cross a month name both months", () => {
  assert.equal(formatTripDates("2026-11-28", "2026-12-02", NOW), "Nov 28 – Dec 2");
});

test("the year appears only when it is not the current year", () => {
  assert.equal(formatTripDates("2026-11-24", "2026-11-27", NOW).includes("2026"), false);
  assert.equal(formatTripDates("2027-03-10", "2027-03-14", NOW), "Mar 10 – 14, 2027");
  assert.equal(formatTripDates("2027-03-30", "2027-04-02", NOW), "Mar 30 – Apr 2, 2027");
  assert.equal(formatTripDates("2025-11-24", "2025-11-27", NOW), "Nov 24 – 27, 2025");
});

test("a trip that spans two years shows both years", () => {
  assert.equal(formatTripDates("2026-12-28", "2027-01-03", NOW), "Dec 28, 2026 – Jan 3, 2027");
});

test("a one-day trip is one date, and unreadable input is shown as given", () => {
  assert.equal(formatTripDates("2026-11-24", "2026-11-24", NOW), "Nov 24");
  assert.equal(formatTripDates("soon", "later", NOW), "soon – later");
  assert.equal(formatTripDates("2026-13-01", "2026-13-02", NOW), "2026-13-01 – 2026-13-02");
  assert.equal(formatTripDates("", "", NOW), " – ");
});

test("trip dates are not shifted by the time zone", () => {
  // The same string must give the same answer at any hour of the day.
  for (const hour of ["00:00:00Z", "12:00:00Z", "23:59:59Z"]) {
    assert.equal(formatTripDates("2026-11-24", "2026-11-27", new Date(`2026-10-25T${hour}`)), "Nov 24 – 27");
  }
});

test("the current year is read from the clock", () => {
  assert.equal(formatTripDates("2027-03-10", "2027-03-14", new Date("2027-01-02T00:00:00Z")), "Mar 10 – 14");
});

test("duration reads as hours and minutes", () => {
  assert.equal(formatDuration(623), "10h 23m");
  assert.equal(formatDuration(355), "5h 55m");
  assert.equal(formatDuration(60), "1h");
  assert.equal(formatDuration(120), "2h");
  assert.equal(formatDuration(45), "45m");
  assert.equal(formatDuration(0), "0m");
  assert.equal(formatDuration(61), "1h 1m");
  assert.equal(formatDuration(59.6), "1h");
});

test("an unknown duration is empty, never 'null' or 'NaN'", () => {
  for (const bad of [null, undefined, NaN, Infinity, -5]) assert.equal(formatDuration(bad as any), "");
});

test("fare time has month, day and time but no seconds", () => {
  assert.equal(formatFareTime("2026-10-25T02:56:41Z", "UTC"), "Oct 25, 2:56 AM");
  assert.equal(formatFareTime("2026-10-25T14:05:59.999Z", "UTC"), "Oct 25, 2:05 PM");
  assert.equal(formatFareTime("2026-10-25T00:00:00Z", "UTC"), "Oct 25, 12:00 AM");
  assert.ok(!/:\d\d:\d\d/.test(formatFareTime("2026-10-25T02:56:41Z", "UTC")), "no seconds");
});

test("fare time uses a plain space before AM/PM and respects the time zone", () => {
  const t = formatFareTime("2026-10-25T02:56:41Z", "America/Chicago");
  assert.equal(t, "Oct 24, 9:56 PM");
  assert.ok(!/[\u202f\u00a0]/.test(t));
});

test("an unreadable fare time is empty", () => {
  for (const bad of ["Sample fares — not a live quote", "", null, undefined, "nope"]) assert.equal(formatFareTime(bad as any, "UTC"), "");
});
