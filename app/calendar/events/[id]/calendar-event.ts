import type { CalendarEvent } from "@/lib/ics";
import { resolveOccurrence } from "@/lib/occurrence";
import { absoluteUrl, eventUrl } from "@/lib/seo";
import type { loadEvent } from "./load-event";

type Loaded = NonNullable<Awaited<ReturnType<typeof loadEvent>>>;

/** One occurrence of an event, for its .ics file and Google Calendar link. */
export function calendarEvent({ row, input }: Loaded, occurrence?: string, now = new Date()): CalendarEvent {
  const { start, end } = resolveOccurrence(input, occurrence, now);
  return {
    uid: `${row.id}-${start.toISOString()}@ucscmsa.com`,
    title: row.title,
    description: row.description,
    location: row.location,
    url: absoluteUrl(eventUrl(row.id)),
    start,
    end,
    timing: row.timing,
    cancelled: row.cancelledAt != null,
  };
}
