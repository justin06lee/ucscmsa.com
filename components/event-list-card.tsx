import type { ReactNode } from "react";
import { IntentLink } from "@/components/intent-link";
import type { Occurrence } from "@/lib/rrule-lite";
import { coverThumb } from "@/lib/event-media";
import { EventCover } from "@/components/event-cover";
import { LinkPending } from "@/components/link-pending";

/** An occurrence's page: the event, at this date. */
export function occurrenceHref(o: Pick<Occurrence, "eventId" | "occurrenceStart">): string {
  return `/calendar/events/${o.eventId}?occurrence=${encodeURIComponent(o.occurrenceStart.toISOString())}`;
}

/**
 * One event in a list (the calendar's phone lists, Past events), in the order
 * Justin sketched: the flyer first, on the left, then the title, the time and
 * the place, the whole card one link. `when` is the line under the title: a
 * time in a day's list, a day and time in Past events.
 */
export function EventListCard({
  occurrence: o,
  when,
  href = occurrenceHref(o),
}: {
  occurrence: Occurrence;
  when: ReactNode;
  href?: string;
}) {
  return (
    <IntentLink
      href={href}
      className="event-list-card group relative flex min-h-11 items-start gap-4 py-2"
    >
      <span className="event-list-card__cover pasted w-16 shrink-0">
        <EventCover image={coverThumb(o.cover, o.title)} title={o.title} date={o.occurrenceStart} compact className="w-full" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span data-card-title="" className="font-display text-xl leading-tight text-ink [overflow-wrap:anywhere] group-hover:text-burgundy">{o.title}</span>
        <span className="mt-0.5 text-sm font-medium tabular-nums text-ink/85">{when}</span>
        {o.location ? (
          <span className="text-sm text-ink/70 [overflow-wrap:anywhere]">{o.location}</span>
        ) : null}
      </span>
      <LinkPending />
    </IntentLink>
  );
}
