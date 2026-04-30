import { eq } from "drizzle-orm";
import { db } from "./client";
import { events, eventCancellations } from "./schema";
import { expandEvents, type EventInput, type Occurrence } from "@/lib/rrule-lite";

export async function getOccurrencesInRange(
  rangeStart: Date,
  rangeEnd: Date
): Promise<Occurrence[]> {
  // Fetch every event whose first-occurrence window could overlap OR that recurs indefinitely.
  // For v1 we fetch all events; the expansion step filters properly. Turso + indexes make this fine at MSA scale.
  const rows = await db.select().from(events);

  const cancelRows = await db.select().from(eventCancellations);
  const cancelByEvent = new Map<string, string[]>();
  for (const c of cancelRows) {
    const list = cancelByEvent.get(c.eventId) ?? [];
    list.push(c.occurrenceDate);
    cancelByEvent.set(c.eventId, list);
  }

  const inputs: EventInput[] = rows.map((r) => ({
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
    cancellations: cancelByEvent.get(r.id) ?? [],
  }));

  return expandEvents(inputs, rangeStart, rangeEnd);
}

export async function getUpcomingOccurrences(
  limit: number,
  now: Date = new Date()
): Promise<Occurrence[]> {
  const in30d = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const all = await getOccurrencesInRange(now, in30d);
  return all.slice(0, limit);
}

export async function getEventById(id: string) {
  const rows = await db.select().from(events).where(eq(events.id, id)).limit(1);
  return rows[0] ?? null;
}
