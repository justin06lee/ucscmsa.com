import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { SITE_TZ, toLocalYmd } from "./time";

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

const DAY_MS = 24 * 60 * 60 * 1000;

// Recurrence happens on the Santa Cruz wall clock: a 1:30 PM Jummah stays at
// 1:30 PM local on both sides of a DST change. So we walk *local calendar
// dates* (UTC-midnight Dates used purely as calendar values, as in
// monthGridDays) and convert each date + the start's local time back to an
// instant. Stepping instants by 24h instead shifted every occurrence on the
// other side of a DST change by an hour.

function localCalendarDate(d: Date): Date {
  const [y, m, day] = formatInTimeZone(d, SITE_TZ, "yyyy-MM-dd").split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

function addDays(cal: Date, n: number): Date {
  return new Date(cal.getTime() + n * DAY_MS);
}

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

function calYmd(cal: Date): string {
  return cal.toISOString().slice(0, 10);
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

    const startCal = localCalendarDate(ev.startTime);
    const localTime = formatInTimeZone(ev.startTime, SITE_TZ, "HH:mm:ss.SSS");
    const at = (cal: Date) => fromZonedTime(`${calYmd(cal)}T${localTime}`, SITE_TZ);

    // Days from the first occurrence to the earliest one that can still
    // overlap the range (allowing for its duration). Lets daily and weekly
    // expansion skip ahead instead of walking every day since the event began.
    const leadDays = Math.max(
      0,
      Math.floor((localCalendarDate(rangeStart).getTime() - startCal.getTime()) / DAY_MS) -
        Math.ceil(durationMs / DAY_MS) -
        1
    );

    if (ev.recurrenceFreq === "daily") {
      let cal = addDays(startCal, Math.floor(leadDays / interval) * interval);
      for (let start = at(cal); start < hardStop; start = at(cal)) {
        emit(start);
        cal = addDays(cal, interval);
      }
    } else if (ev.recurrenceFreq === "weekly") {
      const allowed = ev.recurrenceByWeekday
        ? ev.recurrenceByWeekday
            .split(",")
            .map((s) => s.trim().toUpperCase())
            .filter((s) => s in WEEKDAY_MAP)
            .map((s) => WEEKDAY_MAP[s])
        : [startCal.getUTCDay()];
      // Weeks run Sunday to Saturday, like the month grid, and the interval
      // counts whole weeks from the week the event starts in.
      const firstWeek = addDays(startCal, -startCal.getUTCDay());
      const weekStep = 7 * interval;
      let week = addDays(firstWeek, Math.floor(leadDays / weekStep) * weekStep);
      weeks: while (true) {
        for (let i = 0; i < 7; i++) {
          const day = addDays(week, i);
          if (day < startCal || !allowed.includes(day.getUTCDay())) continue;
          const start = at(day);
          if (start >= hardStop) break weeks;
          emit(start);
        }
        if (allowed.length === 0 || at(week) >= hardStop) break;
        week = addDays(week, weekStep);
      }
    } else if (ev.recurrenceFreq === "monthly") {
      const y = startCal.getUTCFullYear();
      const m = startCal.getUTCMonth();
      const dom = startCal.getUTCDate();
      for (let i = 0; ; i++) {
        const month = m + i * interval;
        const ty = y + Math.floor(month / 12);
        const tm = ((month % 12) + 12) % 12;
        // Clamp e.g. Jan 31 -> Feb 28; later months go back to the 31st.
        const start = at(new Date(Date.UTC(ty, tm, Math.min(dom, daysInMonth(ty, tm)))));
        if (start >= hardStop) break;
        emit(start);
      }
    } else if (ev.recurrenceFreq === "yearly") {
      const y = startCal.getUTCFullYear();
      const m = startCal.getUTCMonth();
      const dom = startCal.getUTCDate();
      for (let i = 0; ; i++) {
        const ty = y + i * interval;
        // Clamp Feb 29 -> Feb 28 when the target year is not a leap year.
        const start = at(new Date(Date.UTC(ty, m, Math.min(dom, daysInMonth(ty, m)))));
        if (start >= hardStop) break;
        emit(start);
      }
    }
  }

  out.sort((a, b) => a.occurrenceStart.getTime() - b.occurrenceStart.getTime());
  return out;
}
