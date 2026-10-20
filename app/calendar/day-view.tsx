"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Occurrence } from "@/lib/rrule-lite";
import type { PrayerTimes } from "@/lib/aladhan";
import {
  formatLocal,
  parseHMInLocal,
  floorLocalHour,
  ceilLocalHour,
  localHourLabel,
  toLocalYmd,
} from "@/lib/time";
import { FadeIn } from "@/components/fade-in";

const HOUR_H = 56;
const LABEL_MIN_GAP = 22;

type Props = { ymd: string; occurrences: Occurrence[]; prayer: PrayerTimes };

function localHourAndMinute(utc: Date): { h: number; m: number } {
  const hm = formatLocal(utc, "H:m").split(":");
  return { h: Number(hm[0]), m: Number(hm[1]) };
}

const DAY_MIN = 24 * 60;
const MIN_EVENT_H = 24;

function wallMinutes(utc: Date): number {
  const { h, m } = localHourAndMinute(utc);
  return h * 60 + m;
}

type Placed = {
  o: Occurrence;
  start: number; // wall-clock minutes since local midnight, clipped to this day
  end: number;
  lane: number;
  lanes: number;
};

// Clip each occurrence to this local day, then give events that overlap
// (visually, counting the minimum chip height) their own lane so none is
// hidden behind another.
function placeOccurrences(occurrences: Occurrence[], ymd: string): Placed[] {
  const minDur = (MIN_EVENT_H / HOUR_H) * 60;
  const items = occurrences
    .map((o) => {
      const start = toLocalYmd(o.occurrenceStart) < ymd ? 0 : wallMinutes(o.occurrenceStart);
      const end = toLocalYmd(o.occurrenceEnd) > ymd ? DAY_MIN : wallMinutes(o.occurrenceEnd);
      return { o, start, end: Math.max(end, start), lane: 0, lanes: 1 };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);

  let cluster: Placed[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    for (const p of cluster) p.lanes = laneEnds.length;
    cluster = [];
    laneEnds = [];
  };
  for (const p of items) {
    const visualEnd = Math.max(p.end, p.start + minDur);
    if (p.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((e) => e <= p.start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = visualEnd;
    p.lane = lane;
    cluster.push(p);
    clusterEnd = Math.max(clusterEnd, visualEnd);
  }
  flush();
  return items;
}

export function DayView({ ymd, occurrences, prayer }: Props) {
  const fajrUtc = parseHMInLocal(ymd, prayer.fajr);
  const ishaUtc = parseHMInLocal(ymd, prayer.isha);
  const placed = placeOccurrences(occurrences, ymd);
  // The grid runs Fajr to Isha, stretched to cover any event outside that
  // window (an evening halaqa after an early winter Isha, say).
  const gridStart = Math.max(
    0,
    Math.min(floorLocalHour(fajrUtc), ...placed.map((p) => Math.floor(p.start / 60))),
  );
  const gridEnd = Math.min(
    24,
    Math.max(ceilLocalHour(ishaUtc), gridStart + 1, ...placed.map((p) => Math.ceil(p.end / 60))),
  );
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

  const [nowTop, setNowTop] = useState<number | null>(null);
  useEffect(() => {
    function update() {
      const now = new Date();
      if (toLocalYmd(now) !== ymd) {
        setNowTop(null);
        return;
      }
      const { h, m } = localHourAndMinute(now);
      const top = (h - gridStart) * HOUR_H + (m / 60) * HOUR_H;
      setNowTop(top >= 0 && top <= bodyHeight ? top : null);
    }
    update();
    const id = window.setInterval(update, 60_000);
    // Browsers throttle setInterval in background tabs; resync on visibility return.
    function onVisibility() {
      if (document.visibilityState === "visible") update();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ymd, gridStart, bodyHeight]);

  return (
    <FadeIn>
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
          {nowTop != null && (
            <div
              className="day-grid__now"
              style={{ top: nowTop }}
              aria-label="Current time"
            >
              <span className="day-grid__now-dot" />
            </div>
          )}
          {occurrences.length === 0 ? (
            <div className="day-grid__empty">No events scheduled</div>
          ) : (
            placed.map(({ o, start, end, lane, lanes }) => {
              const top = (start / 60 - gridStart) * HOUR_H;
              const rawHeight = ((end - start) / 60) * HOUR_H;
              const height = Math.max(MIN_EVENT_H, Math.min(rawHeight, bodyHeight - top));
              const showTime = height >= 48;
              const laneStyle =
                lanes > 1
                  ? {
                      left: `calc(8px + (100% - 16px) * ${lane / lanes})`,
                      width: `calc((100% - 16px) / ${lanes} - 4px)`,
                      right: "auto",
                    }
                  : null;
              return (
                <Link
                  key={`${o.eventId}-${o.occurrenceStart.toISOString()}`}
                  href={`/calendar/events/${o.eventId}?occurrence=${encodeURIComponent(o.occurrenceStart.toISOString())}`}
                  className="day-grid__event"
                  style={{ top, height, ...laneStyle }}
                  data-lane={`${lane + 1}/${lanes}`}
                >
                  <div className="truncate font-medium leading-tight">{o.title}</div>
                  {showTime && (
                    <div className="truncate text-xs leading-tight text-ink/60">
                      {formatLocal(o.occurrenceStart, "h:mm a")} –{" "}
                      {formatLocal(o.occurrenceEnd, "h:mm a")}
                    </div>
                  )}
                </Link>
              );
            })
          )}
        </div>
      </div>
    </FadeIn>
  );
}
