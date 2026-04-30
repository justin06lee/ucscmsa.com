"use client";

import Link from "next/link";
import type { Occurrence } from "@/lib/rrule-lite";
import { monthGridDays, toLocalYmd, formatLocal } from "@/lib/time";
import { FadeIn } from "@/components/fade-in";

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
          <div key={d} className="px-3 py-2 font-medium">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 border border-ink/10 rounded-lg overflow-hidden bg-paper">
        {grid.map(({ ymd: cellYmd, inMonth }, i) => {
          const dayEvents = byDay.get(cellYmd) ?? [];
          const isToday = cellYmd === todayYmd;
          const dayNum = Number(cellYmd.split("-")[2]);
          const col = i % 7;
          const row = Math.floor(i / 7);
          return (
            <Link
              key={cellYmd}
              href={`/calendar?view=day&date=${cellYmd}`}
              className={`
                group relative min-h-32 px-3 py-2 flex flex-col gap-1 transition-colors
                ${inMonth ? "text-ink hover:bg-ink/[0.04]" : "text-ink/30 bg-ink/[0.015]"}
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
                  <span className={`text-sm font-medium ${inMonth ? "" : "opacity-70"}`}>
                    {dayNum}
                  </span>
                )}
              </div>
              {dayEvents.slice(0, 3).map((o) => (
                <div
                  key={`${o.eventId}-${o.occurrenceStart.toISOString()}`}
                  className={`truncate rounded-md border px-1.5 py-0.5 text-xs transition-opacity ${
                    inMonth
                      ? "border-burgundy/15 bg-burgundy/10 text-burgundy"
                      : "border-burgundy/10 bg-burgundy/5 text-burgundy/50"
                  }`}
                >
                  <span className="tabular-nums">
                    {formatLocal(o.occurrenceStart, "h:mm a")}
                  </span>{" "}
                  {o.title}
                </div>
              ))}
              {dayEvents.length > 3 && (
                <div className={`text-xs ${inMonth ? "text-dim" : "text-dim/50"}`}>
                  +{dayEvents.length - 3} more
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </FadeIn>
  );
}
