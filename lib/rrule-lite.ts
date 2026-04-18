import { getDay } from "date-fns";
import { SITE_TZ, toLocalYmd, toZonedTime } from "./time";

export type RecurrenceFreq = "daily" | "weekly" | "monthly" | "yearly";

export type EventInput = {
  id: string;
  title: string;
  description: string;
  location: string;
  startTime: Date;
  endTime: Date;
  recurrenceFreq: RecurrenceFreq | null;
  recurrenceByWeekday: string | null; // "MO,WE,FR"
  recurrenceInterval: number;
  recurrenceUntil: Date | null;
  cancellations: string[]; // YYYY-MM-DD (local)
};

export type Occurrence = {
  eventId: string;
  title: string;
  description: string;
  location: string;
  occurrenceStart: Date;
  occurrenceEnd: Date;
};

const WEEKDAY_MAP: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

function addDaysUtc(d: Date, n: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

function addYearsUtc(d: Date, n: number): Date {
  const out = new Date(d.getTime());
  const dom = out.getUTCDate();
  out.setUTCFullYear(out.getUTCFullYear() + n);
  // Clamp Feb 29 -> Feb 28 when target year is not a leap year.
  if (out.getUTCDate() !== dom) out.setUTCDate(0);
  return out;
}

function occursOnAllowedWeekday(d: Date, allowed: number[]): boolean {
  return allowed.includes(getDay(toZonedTime(d, SITE_TZ)));
}

function addMonthsClamped(start: Date, months: number): Date {
  // Use UTC math explicitly so we don't accidentally shift by an hour across a
  // DST boundary. date-fns `addMonths` operates in local time, which causes
  // e.g. Jan 31 19:00Z (11:00 PST) to become Mar 31 18:00Z (11:00 PDT).
  const sourceDom = start.getUTCDate();
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const targetYear = year + Math.floor((month + months) / 12);
  const targetMonthRaw = month + months;
  const targetMonth = ((targetMonthRaw % 12) + 12) % 12;
  const daysInMonth = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0)
  ).getUTCDate();
  const day = Math.min(sourceDom, daysInMonth);
  const out = new Date(start.getTime());
  out.setUTCFullYear(targetYear, targetMonth, day);
  return out;
}

export function expandEvents(
  events: EventInput[],
  rangeStart: Date,
  rangeEnd: Date
): Occurrence[] {
  const out: Occurrence[] = [];

  for (const ev of events) {
    const durationMs = ev.endTime.getTime() - ev.startTime.getTime();
    const cancelSet = new Set(ev.cancellations);

    const emit = (start: Date) => {
      const end = new Date(start.getTime() + durationMs);
      // Overlap with [rangeStart, rangeEnd)
      if (end <= rangeStart || start >= rangeEnd) return;
      if (cancelSet.has(toLocalYmd(start))) return;
      out.push({
        eventId: ev.id,
        title: ev.title,
        description: ev.description,
        location: ev.location,
        occurrenceStart: start,
        occurrenceEnd: end,
      });
    };

    if (ev.recurrenceFreq === null) {
      emit(ev.startTime);
      continue;
    }

    const interval = Math.max(1, ev.recurrenceInterval || 1);
    const hardStop = ev.recurrenceUntil
      ? new Date(Math.min(ev.recurrenceUntil.getTime(), rangeEnd.getTime()))
      : rangeEnd;

    if (ev.recurrenceFreq === "daily") {
      let cursor = ev.startTime;
      while (cursor < hardStop) {
        emit(cursor);
        cursor = addDaysUtc(cursor, interval);
      }
    } else if (ev.recurrenceFreq === "weekly") {
      const allowed = ev.recurrenceByWeekday
        ? ev.recurrenceByWeekday
            .split(",")
            .map((s) => s.trim().toUpperCase())
            .filter((s) => s in WEEKDAY_MAP)
            .map((s) => WEEKDAY_MAP[s])
        : [getDay(toZonedTime(ev.startTime, SITE_TZ))];

      let weekCursor = ev.startTime;
      while (weekCursor < hardStop) {
        for (let i = 0; i < 7; i++) {
          const day = addDaysUtc(weekCursor, i);
          if (day < ev.startTime) continue;
          if (day >= hardStop) break;
          if (occursOnAllowedWeekday(day, allowed)) emit(day);
        }
        weekCursor = addDaysUtc(weekCursor, 7 * interval);
      }
    } else if (ev.recurrenceFreq === "monthly") {
      let i = 0;
      while (true) {
        const candidate = addMonthsClamped(ev.startTime, i * interval);
        if (candidate >= hardStop) break;
        emit(candidate);
        i++;
      }
    } else if (ev.recurrenceFreq === "yearly") {
      let i = 0;
      while (true) {
        const candidate = addYearsUtc(ev.startTime, i * interval);
        if (candidate >= hardStop) break;
        emit(candidate);
        i++;
      }
    }
  }

  out.sort((a, b) => a.occurrenceStart.getTime() - b.occurrenceStart.getTime());
  return out;
}
