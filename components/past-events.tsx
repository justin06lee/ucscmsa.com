import Link from "next/link";
import { getPastOccurrences } from "@/lib/db/queries";
import { coverThumb } from "@/lib/event-media";
import { formatLocal, toLocalYmd } from "@/lib/time";
import { FlyerThumb } from "@/components/flyer-thumb";

/**
 * The most recent past one-off events, newest first: a compact list under the
 * landing's Upcoming, quieter than the Upcoming cards so it never competes
 * with them. Weekly series (halaqas) and Jummah are left out.
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
    <ol className="divide-y divide-ink/10 rounded-xl border border-ink/10">
      {items.map((o) => {
        const sameYear = toLocalYmd(o.occurrenceStart).slice(0, 4) === thisYear;
        const thumb = coverThumb(o.cover, o.title);
        return (
          <li key={`${o.eventId}-${o.occurrenceStart.toISOString()}`}>
            <Link
              href={`/calendar/events/${o.eventId}`}
              className="flex min-h-11 items-baseline gap-4 px-4 py-2.5 transition-colors hover:bg-ink/[0.03]"
            >
              <span className="w-24 shrink-0 text-xs tabular-nums text-ink/70">
                {formatLocal(o.occurrenceStart, sameYear ? "EEE, MMM d" : "MMM d, yyyy")}
              </span>
              <span className="min-w-0 font-medium leading-snug text-ink/85">{o.title}</span>
              {thumb ? <FlyerThumb image={thumb} width={32} className="ml-auto self-center" /> : null}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
