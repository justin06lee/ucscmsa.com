import { and, eq, gt, gte, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db, type DB } from "./client";
import { events, eventCancellations } from "./schema";
import { expandEvents, type EventInput, type Occurrence } from "@/lib/rrule-lite";

const MAX_EVENTS_PER_RANGE = 5000;

export async function getOccurrencesInRange(
  rangeStart: Date,
  rangeEnd: Date
): Promise<Occurrence[]> {
  // Only fetch events that could plausibly overlap the range:
  //   - non-recurring: standard interval overlap (start < rangeEnd AND end > rangeStart)
  //   - recurring:     start < rangeEnd AND (no until OR until >= rangeStart)
  // Hard cap to keep memory/CPU bounded if a bad query slips through.
  const rows = await db
    .select()
    .from(events)
    .where(
      and(
        isNull(events.cancelledAt),
        lt(events.startTime, rangeEnd),
        or(
          and(isNull(events.recurrenceFreq), gt(events.endTime, rangeStart)),
          and(
            isNotNull(events.recurrenceFreq),
            or(isNull(events.recurrenceUntil), gte(events.recurrenceUntil, rangeStart)),
          ),
        ),
      ),
    )
    .orderBy(sql`${events.startTime} asc`)
    .limit(MAX_EVENTS_PER_RANGE);

  const cancelByEvent = new Map<string, string[]>();
  if (rows.length > 0) {
    const cancelRows = await db
      .select()
      .from(eventCancellations)
      .where(inArray(eventCancellations.eventId, rows.map((r) => r.id)));
    for (const c of cancelRows) {
      const list = cancelByEvent.get(c.eventId) ?? [];
      list.push(c.occurrenceDate);
      cancelByEvent.set(c.eventId, list);
    }
  }

  const inputs = rows.map((r) => toEventInput(r, cancelByEvent.get(r.id) ?? []));
  return expandEvents(inputs, rangeStart, rangeEnd);
}

function toEventInput(r: typeof events.$inferSelect, cancellations: string[]): EventInput {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    location: r.location,
    startTime: r.startTime,
    endTime: r.endTime,
    recurrenceFreq: r.recurrenceFreq,
    recurrenceByWeekday: r.recurrenceByWeekday,
    recurrenceInterval: r.recurrenceInterval,
    recurrenceUntil: r.recurrenceUntil,
    cancellations,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The occurrence of `eventId` that starts exactly at `occurrenceStart`, or
 * null when the event doesn't exist, is cancelled, or has no (uncancelled)
 * occurrence then.
 * Used to check start times that arrive from the client.
 */
export async function findOccurrence(
  eventId: string,
  occurrenceStart: Date,
  database: DB = db
): Promise<Occurrence | null> {
  const t = occurrenceStart.getTime();
  if (Number.isNaN(t)) return null;
  const [row] = await database.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!row || row.cancelledAt) return null;
  const cancelRows = await database
    .select()
    .from(eventCancellations)
    .where(eq(eventCancellations.eventId, eventId));
  const occurrences = expandEvents(
    [toEventInput(row, cancelRows.map((c) => c.occurrenceDate))],
    new Date(t - DAY_MS),
    new Date(t + DAY_MS)
  );
  return occurrences.find((o) => o.occurrenceStart.getTime() === t) ?? null;
}

export async function getUpcomingOccurrences(
  limit: number,
  now: Date = new Date()
): Promise<Occurrence[]> {
  const in30d = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const all = await getOccurrencesInRange(now, in30d);
  return all.slice(0, limit);
}

