import { getPastOccurrences } from "@/lib/db/queries";
import { formatLocal, toLocalYmd } from "@/lib/time";
import { EventListCard } from "@/components/event-list-card";

/**
 * The most recent past one-off events, newest first: list cards under the
 * landing's Upcoming (date, title, place, a small cover), two across from sm,
 * quieter than the Upcoming cards so they never compete with them. Weekly
 * series and Jummah are left out.
 */
export async function PastEvents({ limit = 4 }: { limit?: number }) {
  let items;
  try {
    items = await getPastOccurrences(limit);
  } catch (err) {
    console.error("PastEvents: failed to load occurrences", err);
    return null;
  }
  if (items.length === 0) {
    return <p className="text-sm italic text-dim">No past events yet.</p>;
  }

  const thisYear = toLocalYmd(new Date()).slice(0, 4);
  return (
    <ol className="grid gap-3 sm:grid-cols-2">
      {items.map((o) => {
        const sameYear = toLocalYmd(o.occurrenceStart).slice(0, 4) === thisYear;
        return (
          <li key={`${o.eventId}-${o.occurrenceStart.toISOString()}`} className="min-w-0">
            <EventListCard
              occurrence={o}
              when={formatLocal(o.occurrenceStart, sameYear ? "EEE, MMM d" : "MMM d, yyyy")}
              href={`/calendar/events/${o.eventId}`}
            />
          </li>
        );
      })}
    </ol>
  );
}
