import { isRealYmd } from "./event-rules";

// The `?date=` parameter of the calendar views. Only a real YYYY-MM-DD in the
// supported range is accepted; anything else ("2026-13-01", "9999-99-99",
// "2026-02-31", "0001-01-01") falls back to today, so a typo or a stray link
// can't turn the page into a 500 or a two-thousand-year view. Noon UTC keeps
// the requested day on both sides of a DST change in the site time zone.
export function parseCalendarDate(d: string | undefined, now: Date = new Date()): Date {
  if (d && isRealYmd(d)) return new Date(`${d}T12:00:00.000Z`);
  return now;
}
