import { getPastOccurrences } from "@/lib/db/queries";
import { startTimeText } from "@/lib/event-time";
import { toLocalYmd } from "@/lib/time";
import { DayText } from "@/components/day-text";
import { EventListCard } from "@/components/event-list-card";

/**
 * The most recent past one-off events, newest first: list cards under the
 * landing's Upcoming (a small cover, title, day and time, place), two across from sm,
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

  const today = toLocalYmd(new Date());
  const thisYear = today.slice(0, 4);
  return (
    <ol className="grid gap-3 sm:grid-cols-2">
      {items.map((o) => {
        const sameYear = toLocalYmd(o.occurrenceStart).slice(0, 4) === thisYear;
        const time = startTimeText(o.occurrenceStart, o.timing);
        return (
          <li key={`${o.eventId}-${o.occurrenceStart.toISOString()}`} className="min-w-0">
            <EventListCard
              occurrence={o}
              when={
                <>
                  <DayText
                    iso={o.occurrenceStart.toISOString()}
                    today={today}
                    fmt={sameYear ? "EEE, MMM d" : "MMM d, yyyy"}
                  />
                  {time ? ` · ${time}` : null}
                </>
              }
              href={`/calendar/events/${o.eventId}`}
            />
          </li>
        );
      })}
    </ol>
  );
}
