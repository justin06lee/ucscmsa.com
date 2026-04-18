import Link from "next/link";
import { getUpcomingOccurrences } from "@/lib/db/queries";
import { formatLocal } from "@/lib/time";

export async function UpcomingEvents({ limit = 3 }: { limit?: number }) {
  const items = await getUpcomingOccurrences(limit);

  if (items.length === 0) {
    return (
      <p className="text-dim italic">No events scheduled yet. Check back soon.</p>
    );
  }

  return (
    <ul className="flex flex-col gap-4 md:flex-row md:gap-6">
      {items.map((o) => (
        <li
          key={`${o.eventId}-${o.occurrenceStart.toISOString()}`}
          className="flex-1 rounded-lg border border-ink/10 bg-paper p-4 shadow-sm"
        >
          <Link
            href={`/calendar/events/${o.eventId}?occurrence=${encodeURIComponent(
              o.occurrenceStart.toISOString()
            )}`}
            className="block"
          >
            <div className="text-sm text-dim">
              {formatLocal(o.occurrenceStart, "EEE, MMM d · h:mm a")}
            </div>
            <div className="text-lg font-medium text-ink">{o.title}</div>
            {o.location ? (
              <div className="text-sm text-dim">{o.location}</div>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
