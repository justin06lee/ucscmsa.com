import type { EventTiming } from "./event-rules";
import { formatLocal, toLocalYmd } from "./time";

// How an event's time reads on the site. Times that weren't announced are said
// to be unknown, never filled in (see EVENT_TIMINGS in lib/event-rules.ts): the
// stored 00:00 start and end-of-day end of an untimed event are never shown.

export const TIME_NOT_ANNOUNCED = "Time not announced";

type When = { occurrenceStart: Date; occurrenceEnd: Date; timing: EventTiming };

/** "6:00 – 8:00 PM" when both share AM/PM, else "11:00 AM – 3:00 PM". */
function clockRange(start: Date, end: Date): string {
  const a = formatLocal(start, "h:mm a");
  const b = formatLocal(end, "h:mm a");
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)} – ${b}` : `${a} – ${b}`;
}

/** The start time ("6:00 PM"), or null when only the date is known. */
export function startTimeText(start: Date, timing: EventTiming): string | null {
  return timing === "date_only" ? null : formatLocal(start, "h:mm a");
}

/**
 * True when an occurrence has no time to place it at on this local day: a
 * date-only event, or a start-only one on a day after it started. Day views
 * list these at the top rather than at a made-up hour.
 */
export function untimedOnDay(o: When, ymd: string): boolean {
  if (o.timing === "date_only") return true;
  return o.timing === "start_only" && toLocalYmd(o.occurrenceStart) < ymd;
}

/** An occurrence's time as seen on one local day, for the day and month lists. */
export function timeOnDay(o: When, ymd: string): string {
  if (o.timing === "date_only") return TIME_NOT_ANNOUNCED;
  const startsToday = toLocalYmd(o.occurrenceStart) === ymd;
  const start = formatLocal(o.occurrenceStart, "h:mm a");
  if (o.timing === "start_only") return startsToday ? start : "Continues";
  const endsToday = toLocalYmd(o.occurrenceEnd) === ymd;
  if (!startsToday) return `Until ${formatLocal(o.occurrenceEnd, "h:mm a")}`;
  if (!endsToday) return `${start} onward`;
  return clockRange(o.occurrenceStart, o.occurrenceEnd);
}

/**
 * The date and time lines of an event page. A multi-day event names both days;
 * a start-only one says when it starts and no more.
 */
export function occurrenceWhen(o: When): { date: string; time: string } {
  const { occurrenceStart: start, occurrenceEnd: end } = o;
  const multiDay = toLocalYmd(end) > toLocalYmd(start);
  const sameYear = formatLocal(start, "yyyy") === formatLocal(end, "yyyy");
  const date = !multiDay
    ? formatLocal(start, "EEEE, MMMM d, yyyy")
    : `${formatLocal(start, sameYear ? "EEE, MMM d" : "EEE, MMM d, yyyy")} – ${formatLocal(end, "EEE, MMM d, yyyy")}`;
  if (o.timing === "date_only") return { date, time: TIME_NOT_ANNOUNCED };
  if (o.timing === "start_only") return { date, time: `Starts ${formatLocal(start, "h:mm a")}` };
  const time = multiDay
    ? `${formatLocal(start, "EEE h:mm a")} – ${formatLocal(end, "EEE h:mm a")}`
    : clockRange(start, end);
  return { date, time };
}
