import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Occurrence } from "@/lib/rrule-lite";
import { formatLocal, parseHMInLocal, toLocalYmd } from "@/lib/time";
import { timeRange } from "./day-agenda";

/**
 * The month's events as a list grouped by day, under the month grid on phones,
 * where grid cells are too narrow to show titles. Each day heading opens that
 * day; each event opens its page. In the current month the days before today
 * fold away under "Earlier this month", so what's coming is first.
 */
export function MonthAgenda({
  ymd,
  occurrences,
  className = "",
}: {
  ymd: string;
  occurrences: Occurrence[];
  className?: string;
}) {
  const month = ymd.slice(0, 7);
  const todayYmd = toLocalYmd(new Date());
  const byDay = new Map<string, Occurrence[]>();
  for (const o of occurrences) {
    const day = toLocalYmd(o.occurrenceStart);
    if (day.slice(0, 7) !== month) continue;
    byDay.set(day, [...(byDay.get(day) ?? []), o]);
  }
  const days = [...byDay.keys()].sort();
  const monthName = formatLocal(parseHMInLocal(`${month}-01`, "12:00"), "MMMM");

  const isCurrentMonth = todayYmd.slice(0, 7) === month;
  const earlier = isCurrentMonth ? days.filter((d) => d < todayYmd) : [];
  const rest = isCurrentMonth ? days.filter((d) => d >= todayYmd) : days;
  const earlierCount = earlier.reduce((n, d) => n + byDay.get(d)!.length, 0);

  const dayList = (list: string[]) => (
    <ol className="flex flex-col gap-3">
      {list.map((day) => (
        <li key={day}>
          <h3 className="text-sm font-medium">
            <Link
              href={`/calendar?view=day&date=${day}`}
              className="inline-flex min-h-11 items-center gap-2 hover:text-burgundy"
            >
              {formatLocal(parseHMInLocal(day, "12:00"), "EEEE, MMMM d")}
              {day === todayYmd ? (
                <span className="rounded-full bg-burgundy px-2 py-0.5 text-xs text-paper">Today</span>
              ) : null}
            </Link>
          </h3>
          <ul className="flex flex-col gap-1.5">
            {byDay.get(day)!.map((o) => (
              <li key={`${o.eventId}-${o.occurrenceStart.toISOString()}`}>
                <Link
                  href={`/calendar/events/${o.eventId}?occurrence=${encodeURIComponent(o.occurrenceStart.toISOString())}`}
                  className="flex min-h-11 items-baseline gap-3 rounded-lg border border-burgundy/20 bg-burgundy/[0.06] px-3 py-2 transition-colors hover:border-burgundy"
                >
                  <span className="w-24 shrink-0 text-xs tabular-nums text-ink/70">{timeRange(o, day)}</span>
                  <span className="min-w-0">
                    <span className="block font-medium leading-snug">{o.title}</span>
                    {o.location ? <span className="block text-xs text-ink/70">{o.location}</span> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );

  return (
    <section aria-labelledby="month-agenda-heading" className={className}>
      <h2 id="month-agenda-heading" className="mb-3 text-2xl">
        {monthName} events
      </h2>
      {days.length === 0 ? (
        <p className="text-sm italic text-dim">No events this month.</p>
      ) : (
        <>
          {earlier.length > 0 ? (
            <details className="month-agenda__earlier group mb-3 rounded-lg border border-ink/10">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                <ChevronRight size={16} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-90" />
                Earlier this month
                <span className="ml-auto text-xs font-normal tabular-nums text-ink/70">
                  {earlierCount} event{earlierCount === 1 ? "" : "s"}
                </span>
              </summary>
              <div className="px-3 pb-3">{dayList(earlier)}</div>
            </details>
          ) : null}
          {rest.length > 0 ? (
            dayList(rest)
          ) : (
            <p className="text-sm italic text-dim">No more events this month.</p>
          )}
        </>
      )}
    </section>
  );
}
