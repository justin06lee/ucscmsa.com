import type { ReactNode } from "react";
import { IntentLink } from "@/components/intent-link";
import { Clock, MapPin } from "lucide-react";
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
      className="event-list-card relative flex min-h-11 items-start gap-3.5 rounded-2xl border border-ink/10 bg-paper p-3 shadow-[0_1px_2px_rgb(21_19_18/0.04)] transition-colors hover:border-ink/30"
    >
      <EventCover image={coverThumb(o.cover, o.title)} title={o.title} date={o.occurrenceStart} compact className="w-20 rounded-xl" />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5">
        <span data-card-title="" className="font-medium leading-snug text-ink [overflow-wrap:anywhere]">{o.title}</span>
        <span className="flex items-start gap-1.5 text-sm tabular-nums text-ink/70">
          <Clock size={14} aria-hidden="true" className="mt-[3px] shrink-0" />
          <span className="min-w-0">{when}</span>
        </span>
        {o.location ? (
          <span className="flex items-start gap-1.5 text-sm text-ink/70">
            <MapPin size={14} aria-hidden="true" className="mt-[3px] shrink-0" />
            <span className="min-w-0 [overflow-wrap:anywhere]">{o.location}</span>
          </span>
        ) : null}
      </span>
      <LinkPending />
    </IntentLink>
  );
}
