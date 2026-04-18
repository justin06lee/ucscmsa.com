"use client";

import Link from "next/link";
import type { Occurrence } from "@/lib/rrule-lite";
import { monthGridDays, toLocalYmd, formatLocal, parseHMInLocal } from "@/lib/time";

type Props = { ymd: string; occurrences: Occurrence[] };

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

  const titleDate = parseHMInLocal(ymd, "12:00");

  return (
    <div>
      <h1 className="text-2xl font-medium mb-4">
        {formatLocal(titleDate, "MMMM yyyy")}
      </h1>
      <div className="grid grid-cols-7 text-sm text-dim mb-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="px-2 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-ink/10 rounded-lg overflow-hidden">
        {grid.map(({ ymd: cellYmd, inMonth }) => {
          const dayEvents = byDay.get(cellYmd) ?? [];
          const isToday = cellYmd === todayYmd;
          const dayNum = Number(cellYmd.split("-")[2]);
          return (
            <Link
              key={cellYmd}
              href={`/calendar?view=day&date=${cellYmd}`}
              className={`bg-paper min-h-28 p-2 flex flex-col gap-1 ${
                inMonth ? "text-ink" : "text-ink/30"
              } ${isToday ? "ring-2 ring-burgundy" : ""}`}
            >
              <div className="text-sm font-medium">{dayNum}</div>
              {dayEvents.slice(0, 3).map((o) => (
                <div
                  key={`${o.eventId}-${o.occurrenceStart.toISOString()}`}
                  className="text-xs truncate rounded px-1 py-0.5 bg-burgundy-soft/30"
                >
                  {formatLocal(o.occurrenceStart, "h:mm a")} {o.title}
                </div>
              ))}
              {dayEvents.length > 3 && (
                <div className="text-xs text-dim">
                  +{dayEvents.length - 3} more
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
