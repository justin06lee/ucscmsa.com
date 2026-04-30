"use client";

import Link from "next/link";
import type { Occurrence } from "@/lib/rrule-lite";
import { formatLocal, parseHMInLocal, toLocalYmd } from "@/lib/time";
import { FadeIn } from "@/components/fade-in";

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
  if (count === 1) return "bg-burgundy/25";
  if (count === 2) return "bg-burgundy/50";
  if (count === 3) return "bg-burgundy/75";
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
    <FadeIn>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {months.map(({ monthName, firstYmd, offset, days }) => {
          const totalCells = offset + days.length;
          const trailing = (7 - (totalCells % 7)) % 7;
          return (
            <div
              key={firstYmd}
              className="rounded-xl border border-ink/10 bg-paper px-4 py-3"
            >
              <Link
                href={`/calendar?view=month&date=${firstYmd}`}
                className="inline-block text-sm font-medium hover:text-burgundy transition-colors"
              >
                {monthName}
              </Link>
              <div className="mt-2 grid grid-cols-7 gap-1 text-[10px] text-dim uppercase tracking-wider">
                {WEEKDAY_INITIALS.map((d, i) => (
                  <div key={i} className="flex h-5 items-center justify-center">
                    {d}
                  </div>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {Array.from({ length: offset }, (_, i) => (
                  <span key={`off-${i}`} className="h-7 w-7" aria-hidden="true" />
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
                      className={`h-7 w-7 rounded-md transition-transform hover:scale-110 ${intensityClass(count)} ${
                        isToday ? "ring-2 ring-burgundy ring-offset-2 ring-offset-paper" : ""
                      }`}
                    />
                  );
                })}
                {Array.from({ length: trailing }, (_, i) => (
                  <span key={`trail-${i}`} className="h-7 w-7" aria-hidden="true" />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </FadeIn>
  );
}
