import { IntentLink } from "@/components/intent-link";
import type { Occurrence } from "@/lib/rrule-lite";
import { monthGridDays, toLocalYmd, formatLocal, parseHMInLocal } from "@/lib/time";
import { FadeIn } from "@/components/fade-in";
import { MonthAgenda } from "./month-agenda";

type Props = { ymd: string; occurrences: Occurrence[] };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function MonthView({ ymd, occurrences }: Props) {
  const grid = monthGridDays(ymd);

  const byDay = new Map<string, Occurrence[]>();
  for (const o of occurrences) {
    const key = toLocalYmd(o.occurrenceStart);
    const list = byDay.get(key) ?? [];
    list.push(o);
    byDay.set(key, list);
  }

  const todayYmd = toLocalYmd(new Date());
  const totalRows = Math.ceil(grid.length / 7);

  return (
    <FadeIn>
      <div className="grid grid-cols-7 text-xs uppercase tracking-wide text-dim mb-2">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-1 py-2 text-center font-medium sm:px-3 sm:text-left">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 border border-ink/10 rounded-lg overflow-hidden bg-paper">
        {grid.map(({ ymd: cellYmd, inMonth }, i) => {
          const dayEvents = byDay.get(cellYmd) ?? [];
          const isToday = cellYmd === todayYmd;
          const dayNum = Number(cellYmd.split("-")[2]);
          const col = i % 7;
          const row = Math.floor(i / 7);
          const n = dayEvents.length;
          const label = `${formatLocal(parseHMInLocal(cellYmd, "12:00"), "EEEE, MMMM d")}, ${
            n === 0 ? "no events" : `${n} event${n === 1 ? "" : "s"}`
          }`;
          return (
            <IntentLink
              key={cellYmd}
              href={`/calendar?view=day&date=${cellYmd}`}
              aria-label={label}
              aria-current={isToday ? "date" : undefined}
              className={`
                group relative min-h-14 px-1 py-1.5 flex flex-col items-center gap-1 transition-colors
                sm:min-h-32 sm:items-stretch sm:px-3 sm:py-2
                ${inMonth ? "text-ink hover:bg-ink/[0.04]" : "text-dim bg-ink/[0.015]"}
                ${col < 6 ? "border-r border-ink/10" : ""}
                ${row < totalRows - 1 ? "border-b border-ink/10" : ""}
              `.replace(/\s+/g, " ").trim()}
            >
              <div className="flex items-center">
                {isToday ? (
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-burgundy text-paper text-sm font-medium">
                    {dayNum}
                  </span>
                ) : (
                  <span className={`text-sm ${inMonth ? "font-medium" : ""}`}>
                    {dayNum}
                  </span>
                )}
              </div>
              {/* Phones: cells are ~50px wide, too narrow for titles. Dots here,
                  the month's events are listed under the grid. */}
              {n > 0 && (
                <span aria-hidden="true" className="flex items-center gap-0.5 sm:hidden">
                  {dayEvents.slice(0, 3).map((o) => (
                    <span
                      key={`${o.eventId}-${o.occurrenceStart.toISOString()}`}
                      className={`h-1.5 w-1.5 rounded-full ${inMonth ? "bg-burgundy" : "bg-burgundy/40"}`}
                    />
                  ))}
                  {n > 3 && <span className="text-[10px] leading-none text-dim">+</span>}
                </span>
              )}
              {dayEvents.slice(0, 3).map((o) => (
                <div
                  key={`${o.eventId}-${o.occurrenceStart.toISOString()}`}
                  className={`hidden rounded-md border px-1.5 py-0.5 text-xs leading-snug break-words transition-opacity sm:line-clamp-2 lg:line-clamp-1 ${
                    inMonth
                      ? "border-burgundy/15 bg-burgundy/10 text-burgundy"
                      : "border-burgundy/10 bg-burgundy/5 text-burgundy/80"
                  }`}
                >
                  {o.timing !== "date_only" ? (
                    <span className="hidden tabular-nums lg:inline">
                      {formatLocal(o.occurrenceStart, "h:mm a")}{" "}
                    </span>
                  ) : null}
                  {o.title}
                </div>
              ))}
              {n > 3 && (
                <div className="hidden text-xs text-dim sm:block">
                  +{n - 3} more
                </div>
              )}
            </IntentLink>
          );
        })}
      </div>
      <MonthAgenda ymd={ymd} occurrences={occurrences} className="mt-8 sm:hidden" />
    </FadeIn>
  );
}
