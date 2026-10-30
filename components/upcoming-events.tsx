import Link from "next/link";
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
  const listClass = ["grid gap-x-9 gap-y-14 sm:grid-cols-3", className].filter(Boolean).join(" ");

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
              <span className="pasted">
                <EventCover
                  image={coverThumb(o.cover, o.title)}
                  title={o.title}
                  date={o.occurrenceStart}
                  className="w-full"
                />
              </span>
              <h3 className="font-display mt-5 text-[1.625rem] leading-[1.15] text-ink [overflow-wrap:anywhere] group-hover:text-burgundy">
                {o.title}
              </h3>
              <span className="mt-2 font-medium tabular-nums text-ink">
                <DayText iso={o.occurrenceStart.toISOString()} today={today} /> ·{" "}
                {startTimeText(o.occurrenceStart, o.timing) ?? TIME_NOT_ANNOUNCED}
              </span>
              {o.location ? (
                <span className="mt-0.5 text-ink/70 [overflow-wrap:anywhere]">{o.location}</span>
              ) : null}
              <LinkPending />
            </Link>
            {rsvp ? <RsvpLink link={rsvp} className="mt-2 self-start" /> : null}
          </li>
        );
      })}
    </ul>
  );
}
