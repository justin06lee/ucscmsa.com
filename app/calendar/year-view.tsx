"use client";

import Link from "next/link";
import type { Occurrence } from "@/lib/rrule-lite";
import { formatLocal, parseHMInLocal, toLocalYmd } from "@/lib/time";

type Props = { ymd: string; occurrences: Occurrence[] };

const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

type MonthLayout = {
  monthName: string;
  firstYmd: string;
  offset: number;
  days: string[];
};

function buildMonth(year: number, monthIndex: number): MonthLayout {
  const mm = String(monthIndex + 1).padStart(2, "0");
  const firstYmd = `${year}-${mm}-01`;
  const firstDate = parseHMInLocal(firstYmd, "12:00");
  const monthName = formatLocal(firstDate, "MMMM");
  const offset = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const days: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dd = String(d).padStart(2, "0");
    days.push(`${year}-${mm}-${dd}`);
  }
  return { monthName, firstYmd, offset, days };
}

function intensityClass(count: number): string {
  if (count === 0) return "bg-ink/[0.06]";
  if (count === 1) return "bg-burgundy/30";
  if (count === 2) return "bg-burgundy/55";
  if (count === 3) return "bg-burgundy/80";
  return "bg-burgundy";
}

export function YearView({ ymd, occurrences }: Props) {
  const year = Number(ymd.split("-")[0]);
  const todayYmd = toLocalYmd(new Date());

  const countByDay = new Map<string, number>();
  for (const o of occurrences) {
    const key = toLocalYmd(o.occurrenceStart);
    countByDay.set(key, (countByDay.get(key) ?? 0) + 1);
  }

  const months = Array.from({ length: 12 }, (_, i) => buildMonth(year, i));

  return (
    <div>
      <header className="mb-6 flex items-baseline justify-between gap-4">
        <h1 className="text-3xl">{year}</h1>
        <div className="flex items-center gap-2 text-xs text-dim">
          <span>Less</span>
          <span className="h-3 w-3 rounded-sm bg-ink/[0.06]" />
          <span className="h-3 w-3 rounded-sm bg-burgundy/30" />
          <span className="h-3 w-3 rounded-sm bg-burgundy/55" />
          <span className="h-3 w-3 rounded-sm bg-burgundy/80" />
          <span className="h-3 w-3 rounded-sm bg-burgundy" />
          <span>More</span>
        </div>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-6">
        {months.map(({ monthName, firstYmd, offset, days }) => (
          <div key={firstYmd}>
            <Link
              href={`/calendar?view=month&date=${firstYmd}`}
              className="inline-block text-sm font-medium hover:text-burgundy transition-colors"
            >
              {monthName}
            </Link>
            <div className="mt-2 grid grid-cols-7 gap-1 text-[10px] text-dim uppercase tracking-wider">
              {WEEKDAY_INITIALS.map((d, i) => (
                <div key={i} className="h-4 flex items-center justify-center">
                  {d}
                </div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {Array.from({ length: offset }, (_, i) => (
                <span key={`off-${i}`} className="h-5 w-5" aria-hidden="true" />
              ))}
              {days.map((dayYmd) => {
                const count = countByDay.get(dayYmd) ?? 0;
                const s = count === 1 ? "" : "s";
                const isToday = dayYmd === todayYmd;
                return (
                  <Link
                    key={dayYmd}
                    href={`/calendar?view=day&date=${dayYmd}`}
                    title={`${dayYmd}: ${count} event${s}`}
                    className={`h-5 w-5 rounded-sm transition-transform hover:scale-110 ${intensityClass(count)} ${
                      isToday ? "ring-2 ring-burgundy ring-offset-1 ring-offset-paper" : ""
                    }`}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
