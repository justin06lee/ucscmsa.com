import Link from "next/link";
import { getUpcomingOccurrences } from "@/lib/db/queries";
import { startTimeText, TIME_NOT_ANNOUNCED } from "@/lib/event-time";
import { coverThumb } from "@/lib/event-media";
import { cardSummary } from "@/lib/event-text";
import { FlyerThumb } from "@/components/flyer-thumb";
import { formatLocal } from "@/lib/time";

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

  // Side by side only from lg: narrower, three cards leave too little room
  // beside a flyer thumbnail.
  const listClass = ["flex flex-col gap-4 lg:flex-row lg:gap-6", className]
    .filter(Boolean)
    .join(" ");

  return (
    <ul className={listClass}>
      {items.map((o) => {
        const thumb = coverThumb(o.cover, o.title);
        const line = cardSummary(o.description, 90);
        return (
          <li
            key={`${o.eventId}-${o.occurrenceStart.toISOString()}`}
            className="min-w-0 flex-1 rounded-xl border border-ink/10 bg-paper p-5 shadow-sm transition-all hover:border-ink/25 hover:shadow-md"
          >
            <Link
              href={`/calendar/events/${o.eventId}?occurrence=${encodeURIComponent(
                o.occurrenceStart.toISOString()
              )}`}
              className="flex items-start gap-4"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-xs uppercase tracking-wide text-dim">
                  {formatLocal(o.occurrenceStart, "EEE, MMM d")} ·{" "}
                  {startTimeText(o.occurrenceStart, o.timing) ?? TIME_NOT_ANNOUNCED}
                </span>
                <span className="mt-1 block text-lg font-medium text-ink">{o.title}</span>
                {o.location ? (
                  <span className="mt-1 block text-sm text-dim">{o.location}</span>
                ) : null}
                {line ? <span className="mt-1.5 block truncate text-sm text-ink/70">{line}</span> : null}
              </span>
              {thumb ? <FlyerThumb image={thumb} width={64} /> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
