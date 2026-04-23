"use client";

import Link from "next/link";
import type { Occurrence } from "@/lib/rrule-lite";
import type { PrayerTimes } from "@/lib/aladhan";
import { formatLocal, parseHMInLocal, floorLocalHour, ceilLocalHour, localHourLabel } from "@/lib/time";

const HOUR_H = 56;
const LABEL_MIN_GAP = 22;

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

  const prayerMarkers = [
    { label: "Fajr", hm: prayer.fajr },
    { label: "Sunrise", hm: prayer.sunrise },
    { label: "Dhuhr", hm: prayer.dhuhr },
    { label: "Asr", hm: prayer.asr },
    { label: "Maghrib", hm: prayer.maghrib },
    { label: "Isha", hm: prayer.isha },
  ].map((p) => {
    const { h, m } = localHourAndMinute(parseHMInLocal(ymd, p.hm));
    return { ...p, lineTop: (h - gridStart) * HOUR_H + (m / 60) * HOUR_H };
  });

  const sortedByTop = [...prayerMarkers].sort((a, b) => a.lineTop - b.lineTop);
  const labelTopByKey = new Map<string, number>();
  let lastLabelTop = -Infinity;
  for (const p of sortedByTop) {
    const top = Math.max(p.lineTop, lastLabelTop + LABEL_MIN_GAP);
    labelTopByKey.set(p.label, top);
    lastLabelTop = top;
  }

  return (
    <div>
      <header className="mb-6 flex flex-wrap gap-x-6 gap-y-3 items-baseline">
        <h1 className="text-3xl">
          {formatLocal(parseHMInLocal(ymd, "12:00"), "EEEE, MMMM d, yyyy")}
        </h1>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-burgundy">
          {prayerMarkers.map((p) => (
            <span key={p.label} className="tabular-nums">
              <span className="font-medium">{p.label}</span> {p.hm}
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
        <div
          className="day-grid__body"
          style={{ gridRow: `1 / span ${hours.length}`, height: bodyHeight }}
        >
          {prayerMarkers.map((p) => (
            <div
              key={`line-${p.label}`}
              className="day-grid__prayer-line"
              style={{ top: p.lineTop }}
              aria-hidden="true"
            />
          ))}
          {prayerMarkers.map((p) => (
            <span
              key={`label-${p.label}`}
              className="day-grid__prayer-label"
              style={{ top: labelTopByKey.get(p.label) }}
            >
              {p.label} {p.hm}
            </span>
          ))}
          {occurrences.length === 0 ? (
            <div className="day-grid__empty">No events scheduled</div>
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
