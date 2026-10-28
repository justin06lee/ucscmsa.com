import Link from "next/link";
import { Clock, MapPin } from "lucide-react";
import { getUpcomingOccurrences } from "@/lib/db/queries";
import { startTimeText, TIME_NOT_ANNOUNCED } from "@/lib/event-time";
import { coverThumb } from "@/lib/event-media";
import { splitLinks } from "@/lib/event-text";
import { toLocalYmd } from "@/lib/time";
import { DayText } from "@/components/day-text";
import { EventCover } from "@/components/event-cover";
import { LinkPending } from "@/components/link-pending";
import { occurrenceHref } from "@/components/event-list-card";
import { RsvpLink } from "@/components/event-actions";

/**
 * The landing's next events as cover-first cards (after Luma's): the whole
 * flyer, the title, the day and time ("Today" and "Tomorrow" when they are),
 * then the place, all one link to the event. An event that takes RSVPs on its
 * own form also gets an RSVP button under it.
 */
export async function UpcomingEvents({
  limit = 3,
  className,
}: {
  limit?: number;
  className?: string;
}) {
  let items;
  try {
    items = await getUpcomingOccurrences(limit);
  } catch (err) {
    console.error("UpcomingEvents: failed to load occurrences", err);
    return (
      <p className="text-dim italic">
        Events are temporarily unavailable. Please refresh in a moment.
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <p className="text-dim italic">No events scheduled yet. Check back soon.</p>
    );
  }

  const today = toLocalYmd(new Date());
  const listClass = ["grid gap-x-6 gap-y-10 sm:grid-cols-3", className].filter(Boolean).join(" ");

  return (
    <ul className={listClass}>
      {items.map((o) => {
        const rsvp = splitLinks(o.links).primary;
        return (
          <li
            key={`${o.eventId}-${o.occurrenceStart.toISOString()}`}
            className="upcoming-card flex min-w-0 flex-col"
          >
            <Link href={occurrenceHref(o)} className="group relative flex flex-col">
              <EventCover
                image={coverThumb(o.cover, o.title)}
                title={o.title}
                date={o.occurrenceStart}
                className="w-full rounded-2xl transition-[border-color,box-shadow] group-hover:border-ink/30 group-hover:shadow-md"
              />
              <h3 className="mt-3 text-lg font-medium leading-snug text-ink [overflow-wrap:anywhere] group-hover:text-burgundy">
                {o.title}
              </h3>
              <span className="mt-1.5 flex items-start gap-1.5 text-sm tabular-nums text-ink/70">
                <Clock size={14} aria-hidden="true" className="mt-[3px] shrink-0" />
                <span>
                  <DayText iso={o.occurrenceStart.toISOString()} today={today} /> ·{" "}
                  {startTimeText(o.occurrenceStart, o.timing) ?? TIME_NOT_ANNOUNCED}
                </span>
              </span>
              {o.location ? (
                <span className="mt-1 flex items-start gap-1.5 text-sm text-ink/70">
                  <MapPin size={14} aria-hidden="true" className="mt-[3px] shrink-0" />
                  <span className="min-w-0 [overflow-wrap:anywhere]">{o.location}</span>
                </span>
              ) : null}
              <LinkPending />
            </Link>
            {rsvp ? <RsvpLink link={rsvp} className="mt-3 self-start" /> : null}
          </li>
        );
      })}
    </ul>
  );
}
