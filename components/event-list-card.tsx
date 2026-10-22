import Link from "next/link";
import { MapPin } from "lucide-react";
import type { Occurrence } from "@/lib/rrule-lite";
import { coverThumb } from "@/lib/event-media";
import { EventCover } from "@/components/event-cover";

/** An occurrence's page: the event, at this date. */
export function occurrenceHref(o: Pick<Occurrence, "eventId" | "occurrenceStart">): string {
  return `/calendar/events/${o.eventId}?occurrence=${encodeURIComponent(o.occurrenceStart.toISOString())}`;
}

/**
 * One event in a list (the calendar's phone lists, Past events), laid out
 * like Luma's: the time on top, the title, the place, and the cover on the
 * right, the whole card one link. `when` is the line above the title: a time
 * in a day's list, a date in Past events.
 */
export function EventListCard({
  occurrence: o,
  when,
  href = occurrenceHref(o),
}: {
  occurrence: Occurrence;
  when: string;
  href?: string;
}) {
  return (
    <Link
      href={href}
      className="event-list-card flex min-h-11 gap-3 rounded-2xl border border-ink/10 bg-paper p-3 shadow-[0_1px_2px_rgb(21_19_18/0.04)] transition-colors hover:border-ink/30"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm tabular-nums text-ink/70">{when}</span>
        <span className="font-medium leading-snug text-ink [overflow-wrap:anywhere]">{o.title}</span>
        {o.location ? (
          <span className="flex items-start gap-1.5 text-sm text-ink/70">
            <MapPin size={14} aria-hidden="true" className="mt-[3px] shrink-0" />
            <span className="min-w-0 [overflow-wrap:anywhere]">{o.location}</span>
          </span>
        ) : null}
      </span>
      <EventCover image={coverThumb(o.cover, o.title)} title={o.title} date={o.occurrenceStart} compact className="w-[72px] self-start rounded-xl" />
    </Link>
  );
}
