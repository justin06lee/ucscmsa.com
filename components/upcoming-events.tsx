import Link from "next/link";
import { getUpcomingOccurrences } from "@/lib/db/queries";
import { startTimeText, TIME_NOT_ANNOUNCED } from "@/lib/event-time";
import { coverThumb } from "@/lib/event-media";
import { splitLinks } from "@/lib/event-text";
import { formatLocal } from "@/lib/time";
import { EventCover } from "@/components/event-cover";
import { occurrenceHref } from "@/components/event-list-card";
import { RsvpLink } from "@/components/event-actions";

/**
 * The landing's next events as cover-first cards (after Luma's): the whole
 * flyer, a date line and the title, the whole card one link to the event. An
 * event that takes RSVPs on its own form also gets an RSVP button, which
 * sits above the card's link.
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

  const listClass = ["grid gap-x-6 gap-y-10 sm:grid-cols-3", className].filter(Boolean).join(" ");

  return (
    <ul className={listClass}>
      {items.map((o) => {
        const rsvp = splitLinks(o.links).primary;
        return (
          <li
            key={`${o.eventId}-${o.occurrenceStart.toISOString()}`}
            className="upcoming-card group relative flex min-w-0 flex-col"
          >
            <EventCover
              image={coverThumb(o.cover, o.title)}
              title={o.title}
              className="w-full rounded-2xl transition-[border-color,box-shadow] group-hover:border-ink/30 group-hover:shadow-md"
            />
            <p className="mt-3 text-sm tabular-nums text-ink/70">
              {formatLocal(o.occurrenceStart, "EEE, MMM d")} ·{" "}
              {startTimeText(o.occurrenceStart, o.timing) ?? TIME_NOT_ANNOUNCED}
            </p>
            <h3 className="mt-1 text-lg font-medium leading-snug text-ink [overflow-wrap:anywhere]">
              {/* Stretched over the whole card, so the flyer opens it too. */}
              <Link
                href={occurrenceHref(o)}
                className="after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-4 focus-visible:after:outline-burgundy"
              >
                {o.title}
              </Link>
            </h3>
            {rsvp ? <RsvpLink link={rsvp} className="relative z-10 mt-3 self-start" /> : null}
          </li>
        );
      })}
    </ul>
  );
}
