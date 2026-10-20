import { expandEvents, type EventInput } from "./rrule-lite";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export type ResolvedOccurrence = { start: Date; end: Date };

/**
 * Which occurrence an event page is about. A `?occurrence=` that names a real,
 * uncancelled occurrence wins; anything else (missing, malformed, or a time the
 * series never hits) falls back to the next upcoming occurrence, and once a
 * series has ended, to its last one. One-off events are always themselves.
 */
export function resolveOccurrence(
  ev: EventInput,
  occurrenceParam: string | undefined,
  now: Date,
): ResolvedOccurrence {
  if (occurrenceParam) {
    const t = new Date(occurrenceParam).getTime();
    if (!Number.isNaN(t)) {
      const hit = expandEvents([ev], new Date(t - 1), new Date(t + 1)).find(
        (o) => o.occurrenceStart.getTime() === t,
      );
      if (hit) return { start: hit.occurrenceStart, end: hit.occurrenceEnd };
    }
  }

  if (!ev.recurrenceFreq) return { start: ev.startTime, end: ev.endTime };

  const next = expandEvents([ev], now, new Date(now.getTime() + YEAR_MS))[0];
  if (next) return { start: next.occurrenceStart, end: next.occurrenceEnd };

  const lastEnd = ev.recurrenceUntil && ev.recurrenceUntil < now ? ev.recurrenceUntil : now;
  const past = expandEvents(
    [ev],
    new Date(Math.max(ev.startTime.getTime(), lastEnd.getTime() - YEAR_MS)),
    lastEnd,
  );
  const last = past.at(-1);
  if (last) return { start: last.occurrenceStart, end: last.occurrenceEnd };
  return { start: ev.startTime, end: ev.endTime };
}
