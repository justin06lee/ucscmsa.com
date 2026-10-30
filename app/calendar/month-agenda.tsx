import { IntentLink } from "@/components/intent-link";
import type { Occurrence } from "@/lib/rrule-lite";
import { timeOnDay } from "@/lib/event-time";
import { EventListCard } from "@/components/event-list-card";
import { nextYmd } from "@/lib/day-label";
import { formatLocal, parseHMInLocal, toLocalYmd } from "@/lib/time";

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

  // After Luma: each day a stop on a dashed line down the side, its events as
  // cards beside it.
  const dayList = (list: string[]) => (
    <ol className="timeline">
      {list.map((day) => (
        <li key={day} className="timeline__day" data-today={day === todayYmd ? "" : undefined}>
          <h3 className="text-sm">
            <IntentLink
              href={`/calendar?view=day&date=${day}`}
              className="inline-flex min-h-11 items-center gap-2 hover:text-burgundy"
            >
              <span className="font-medium">{formatLocal(parseHMInLocal(day, "12:00"), "MMM d")}</span>
              <span className="text-ink/70">{formatLocal(parseHMInLocal(day, "12:00"), "EEEE")}</span>
              {day === todayYmd ? (
                <span className="circled mx-2 text-sm font-medium">Today</span>
              ) : day === nextYmd(todayYmd) ? (
                <span className="text-sm font-medium text-burgundy">Tomorrow</span>
              ) : null}
            </IntentLink>
          </h3>
          <ul className="flex flex-col gap-2.5">
            {byDay.get(day)!.map((o) => (
              <li key={`${o.eventId}-${o.occurrenceStart.toISOString()}`}>
                <EventListCard occurrence={o} when={timeOnDay(o, day)} />
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
            <details className="month-agenda__earlier group mb-3">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                Earlier this month
                <span className="text-xs font-normal tabular-nums text-ink/70">
                  {earlierCount} event{earlierCount === 1 ? "" : "s"}
                </span>
                <span aria-hidden="true" className="ml-auto text-xs font-normal text-burgundy underline underline-offset-2">
                  <span className="group-open:hidden">Show</span>
                  <span className="hidden group-open:inline">Hide</span>
                </span>
              </summary>
              <div className="px-3 pt-1 pb-3">{dayList(earlier)}</div>
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
