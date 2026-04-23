import Link from "next/link";
import { getUpcomingOccurrences } from "@/lib/db/queries";
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

  const listClass = ["flex flex-col gap-4 md:flex-row md:gap-6", className]
    .filter(Boolean)
    .join(" ");

  return (
    <ul className={listClass}>
      {items.map((o) => (
        <li
          key={`${o.eventId}-${o.occurrenceStart.toISOString()}`}
          className="flex-1 rounded-xl border border-ink/10 bg-paper p-5 shadow-sm transition-all hover:border-ink/25 hover:shadow-md"
        >
          <Link
            href={`/calendar/events/${o.eventId}?occurrence=${encodeURIComponent(
              o.occurrenceStart.toISOString()
            )}`}
            className="block"
          >
            <div className="text-xs uppercase tracking-wide text-dim">
              {formatLocal(o.occurrenceStart, "EEE, MMM d · h:mm a")}
            </div>
            <div className="mt-1 text-lg font-medium text-ink">{o.title}</div>
            {o.location ? (
              <div className="mt-1 text-sm text-dim">{o.location}</div>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
