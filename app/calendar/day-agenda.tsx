import Link from "next/link";
import type { Occurrence } from "@/lib/rrule-lite";
import type { PrayerTimes } from "@/lib/aladhan";
import { timeOnDay, untimedOnDay } from "@/lib/event-time";
import { coverThumb } from "@/lib/event-media";
import { FlyerThumb } from "@/components/flyer-thumb";
import { formatLocal, parseHMInLocal, toLocalYmd } from "@/lib/time";

export const PRAYER_MARKERS = [
  { key: "fajr", label: "Fajr" },
  { key: "sunrise", label: "Sunrise" },
  { key: "dhuhr", label: "Dhuhr" },
  { key: "asr", label: "Asr" },
  { key: "maghrib", label: "Maghrib" },
  { key: "isha", label: "Isha" },
] as const;

export type AgendaItem =
  | { kind: "prayer"; key: string; label: string; at: number; time: string }
  | { kind: "event"; key: string; at: number; occurrence: Occurrence; when: string }
  | { kind: "now"; key: "now"; at: number };

function wallMinutes(utc: Date): number {
  const [h, m] = formatLocal(utc, "H:m").split(":").map(Number);
  return h * 60 + m;
}

/**
 * One day as a single time-ordered list: the six prayer-time markers with each
 * event placed by its start, so events read against the prayers ("after Isha",
 * "between Dhuhr and Asr"). Nothing is dropped: events before Fajr come first,
 * events after Isha last, and overlapping events simply follow one another.
 * A marker sorts before an event that starts at the same minute. Events with
 * no time on this day (date-only ones) come first of all, above Fajr, and say
 * so rather than claiming midnight.
 */
export function buildAgenda(
  ymd: string,
  occurrences: Occurrence[],
  prayer: PrayerTimes,
  nowMinutes: number | null = null,
): AgendaItem[] {
  const items: AgendaItem[] = PRAYER_MARKERS.map(({ key, label }) => {
    const at = parseHMInLocal(ymd, prayer[key]);
    return { kind: "prayer" as const, key, label, at: wallMinutes(at), time: formatLocal(at, "h:mm a") };
  });
  for (const o of occurrences) {
    const at = untimedOnDay(o, ymd)
      ? -1
      : toLocalYmd(o.occurrenceStart) < ymd
        ? 0
        : wallMinutes(o.occurrenceStart);
    items.push({
      kind: "event",
      key: `${o.eventId}-${o.occurrenceStart.toISOString()}`,
      at,
      occurrence: o,
      when: timeOnDay(o, ymd),
    });
  }
  if (nowMinutes != null) items.push({ kind: "now", key: "now", at: nowMinutes });
  const rank = { prayer: 0, now: 1, event: 2 } as const;
  return items.sort((a, b) => a.at - b.at || rank[a.kind] - rank[b.kind]);
}

export function DayAgenda({
  ymd,
  occurrences,
  prayer,
  nowMinutes = null,
}: {
  ymd: string;
  occurrences: Occurrence[];
  prayer: PrayerTimes;
  nowMinutes?: number | null;
}) {
  const items = buildAgenda(ymd, occurrences, prayer, nowMinutes);
  const dayLabel = formatLocal(parseHMInLocal(ymd, "12:00"), "EEEE, MMMM d");
  return (
    <div className="day-agenda">
      {occurrences.length === 0 ? (
        <p className="mb-4 text-sm italic text-dim">No events scheduled</p>
      ) : null}
      <ol aria-label={`Prayer times and events, ${dayLabel}`} className="flex flex-col">
        {items.map((item) => {
          if (item.kind === "prayer") {
            return (
              <li key={item.key} className="day-agenda__prayer" data-prayer={item.key}>
                <span className="day-agenda__prayer-label">
                  <span className="font-medium">{item.label}</span>{" "}
                  <span className="tabular-nums">{item.time}</span>
                </span>
              </li>
            );
          }
          if (item.kind === "now") {
            return (
              <li key="now" className="day-agenda__now">
                <span className="sr-only">Now, </span>
                <span aria-hidden="true">Now</span>
              </li>
            );
          }
          const o = item.occurrence;
          return (
            <li key={item.key} className="day-agenda__item">
              <Link
                href={`/calendar/events/${o.eventId}?occurrence=${encodeURIComponent(o.occurrenceStart.toISOString())}`}
                className="day-agenda__event"
              >
                <span className="flex items-start gap-3">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-xs tabular-nums text-ink/70">{item.when}</span>
                    <span className="font-medium leading-snug">{o.title}</span>
                    {o.location ? <span className="text-sm text-ink/75">{o.location}</span> : null}
                  </span>
                  {o.cover ? <FlyerThumb image={coverThumb(o.cover, o.title)!} width={44} /> : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
