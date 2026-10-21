import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { eventCancellations } from "@/lib/db/schema";
import { getPublicEventRow } from "@/lib/db/queries";
import type { EventInput } from "@/lib/rrule-lite";

// Shared by generateMetadata and the page within one request (React cache),
// and by opengraph-image.
export const loadEvent = cache(async (id: string) => {
  // A draft 404s like a missing event: page, metadata and share image.
  const row = await getPublicEventRow(id);
  if (!row) return null;
  const cancelled = await db
    .select({ date: eventCancellations.occurrenceDate })
    .from(eventCancellations)
    .where(eq(eventCancellations.eventId, id));
  const input: EventInput = {
    id: row.id,
    title: row.title,
    description: row.description,
    location: row.location,
    startTime: row.startTime,
    endTime: row.endTime,
    recurrenceFreq: row.recurrenceFreq,
    recurrenceByWeekday: row.recurrenceByWeekday,
    recurrenceInterval: row.recurrenceInterval,
    recurrenceUntil: row.recurrenceUntil,
    cancellations: cancelled.map((c) => c.date),
  };
  return { row, input };
});
