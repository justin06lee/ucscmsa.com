"use client";

import Link from "next/link";
import type { Occurrence } from "@/lib/rrule-lite";
import { formatLocal, parseHMInLocal, toLocalYmd } from "@/lib/time";

type Props = { ymd: string; occurrences: Occurrence[] };

function monthDays(year: number, monthIndex: number): string[] {
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const out: string[] = [];
  const mm = String(monthIndex + 1).padStart(2, "0");
  for (let d = 1; d <= daysInMonth; d++) {
    const dd = String(d).padStart(2, "0");
    out.push(`${year}-${mm}-${dd}`);
  }
  return out;
}

function intensityClass(count: number): string {
  if (count === 0) return "bg-ink/5";
  if (count === 1) return "bg-burgundy/30";
  if (count === 2) return "bg-burgundy/60";
  return "bg-burgundy";
}

export function YearView({ ymd, occurrences }: Props) {
  const year = Number(ymd.split("-")[0]);

  const countByDay = new Map<string, number>();
  for (const o of occurrences) {
    const key = toLocalYmd(o.occurrenceStart);
    countByDay.set(key, (countByDay.get(key) ?? 0) + 1);
  }

  return (
    <div>
      <h1 className="text-2xl font-medium mb-4">{year}</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {Array.from({ length: 12 }, (_, monthIndex) => {
          const mm = String(monthIndex + 1).padStart(2, "0");
          const firstYmd = `${year}-${mm}-01`;
          const firstDate = parseHMInLocal(firstYmd, "12:00");
          const monthName = formatLocal(firstDate, "MMMM");
          const days = monthDays(year, monthIndex);
          return (
            <div key={mm}>
              <Link
                href={`/calendar?view=month&date=${firstYmd}`}
                className="text-sm font-medium hover:text-burgundy"
              >
                {monthName}
              </Link>
              <div className="grid grid-cols-7 gap-0.5 mt-2">
                {days.map((dayYmd) => {
                  const count = countByDay.get(dayYmd) ?? 0;
                  const s = count === 1 ? "" : "s";
                  return (
                    <Link
                      key={dayYmd}
                      href={`/calendar?view=day&date=${dayYmd}`}
                      title={`${dayYmd}: ${count} event${s}`}
                      className={`h-3 w-3 rounded-sm ${intensityClass(count)}`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
