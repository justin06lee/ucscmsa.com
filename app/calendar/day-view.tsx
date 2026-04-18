"use client";

import Link from "next/link";
import type { Occurrence } from "@/lib/rrule-lite";
import type { PrayerTimes } from "@/lib/aladhan";
import { formatLocal, parseHMInLocal, floorLocalHour, ceilLocalHour, localHourLabel } from "@/lib/time";

const HOUR_H = 56;

type Props = { ymd: string; occurrences: Occurrence[]; prayer: PrayerTimes };

function localHourAndMinute(utc: Date): { h: number; m: number } {
  const hm = formatLocal(utc, "H:m").split(":");
  return { h: Number(hm[0]), m: Number(hm[1]) };
}

export function DayView({ ymd, occurrences, prayer }: Props) {
  const fajrUtc = parseHMInLocal(ymd, prayer.fajr);
  const ishaUtc = parseHMInLocal(ymd, prayer.isha);
  const gridStart = floorLocalHour(fajrUtc);
  const gridEnd = ceilLocalHour(ishaUtc);
  const hours = Array.from({ length: gridEnd - gridStart }, (_, i) => gridStart + i);
  const bodyHeight = hours.length * HOUR_H;

  const prayerMarkers: Array<{ label: string; hm: string }> = [
    { label: "Fajr", hm: prayer.fajr },
    { label: "Sunrise", hm: prayer.sunrise },
    { label: "Dhuhr", hm: prayer.dhuhr },
    { label: "Asr", hm: prayer.asr },
    { label: "Maghrib", hm: prayer.maghrib },
    { label: "Isha", hm: prayer.isha },
  ];

  return (
    <div>
      <header className="mb-4 flex flex-wrap gap-x-6 gap-y-2 items-baseline">
        <h1 className="text-2xl font-medium">
          {formatLocal(parseHMInLocal(ymd, "12:00"), "EEEE, MMMM d, yyyy")}
        </h1>
        <div className="flex flex-wrap gap-x-4 text-sm text-burgundy">
          {prayerMarkers.map((p) => (
            <span key={p.label} className="tabular-nums">
              {p.label} {p.hm}
            </span>
          ))}
        </div>
      </header>
      <div
        className="day-grid"
        style={{ gridTemplateRows: `repeat(${hours.length}, ${HOUR_H}px)` }}
      >
        {hours.map((h) => (
          <div key={`label-${h}`} className="day-grid__hour">
            {localHourLabel(h)}
          </div>
        ))}
        <div className="day-grid__body" style={{ gridRow: `1 / span ${hours.length}`, height: bodyHeight }}>
          {prayerMarkers.map((p) => {
            const utc = parseHMInLocal(ymd, p.hm);
            const { h, m } = localHourAndMinute(utc);
            const top = (h - gridStart) * HOUR_H + (m / 60) * HOUR_H;
            return (
              <div
                key={`pm-${p.label}`}
                className="day-grid__prayer-line"
                style={{ top }}
                aria-hidden="true"
              >
                <span className="day-grid__prayer-label" style={{ top: 0 }}>
                  {p.label} {p.hm}
                </span>
              </div>
            );
          })}
          {occurrences.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-dim">
              No events scheduled
            </div>
          ) : (
            occurrences.map((o) => {
              const s = localHourAndMinute(o.occurrenceStart);
              if (s.h < gridStart || s.h >= gridEnd) return null;
              const durMin =
                (o.occurrenceEnd.getTime() - o.occurrenceStart.getTime()) /
                60000;
              const top = (s.h - gridStart) * HOUR_H + (s.m / 60) * HOUR_H;
              const height = (durMin / 60) * HOUR_H;
              return (
                <Link
                  key={`${o.eventId}-${o.occurrenceStart.toISOString()}`}
                  href={`/calendar/events/${o.eventId}?occurrence=${encodeURIComponent(o.occurrenceStart.toISOString())}`}
                  className="day-grid__event"
                  style={{ top, height: Math.max(24, Math.min(height, bodyHeight - top)) }}
                >
                  <div className="font-medium">{o.title}</div>
                  <div className="text-xs text-dim">
                    {formatLocal(o.occurrenceStart, "h:mm a")} –{" "}
                    {formatLocal(o.occurrenceEnd, "h:mm a")}
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
