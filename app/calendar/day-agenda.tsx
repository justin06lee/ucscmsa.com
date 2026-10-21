import Link from "next/link";
import type { Occurrence } from "@/lib/rrule-lite";
import type { PrayerTimes } from "@/lib/aladhan";
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

export function timeRange(o: Occurrence, ymd: string): string {
  const startsToday = toLocalYmd(o.occurrenceStart) === ymd;
  const endsToday = toLocalYmd(o.occurrenceEnd) === ymd;
  const start = formatLocal(o.occurrenceStart, "h:mm a");
  const end = formatLocal(o.occurrenceEnd, "h:mm a");
  if (!startsToday) return `Until ${end}`;
  if (!endsToday) return `${start} onward`;
  // "1:15 – 2:00 PM" when both share AM/PM, else "11:00 AM – 3:00 PM".
  return start.slice(-2) === end.slice(-2) ? `${start.slice(0, -3)} – ${end}` : `${start} – ${end}`;
}

/**
 * One day as a single time-ordered list: the six prayer-time markers with each
 * event placed by its start, so events read against the prayers ("after Isha",
 * "between Dhuhr and Asr"). Nothing is dropped: events before Fajr come first,
 * events after Isha last, and overlapping events simply follow one another.
 * A marker sorts before an event that starts at the same minute.
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
    const at = toLocalYmd(o.occurrenceStart) < ymd ? 0 : wallMinutes(o.occurrenceStart);
    items.push({
      kind: "event",
      key: `${o.eventId}-${o.occurrenceStart.toISOString()}`,
      at,
      occurrence: o,
      when: timeRange(o, ymd),
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
                <span className="text-xs tabular-nums text-ink/70">{item.when}</span>
                <span className="font-medium leading-snug">{o.title}</span>
                {o.location ? <span className="text-sm text-dim">{o.location}</span> : null}
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
