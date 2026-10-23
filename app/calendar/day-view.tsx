"use client";

import { useEffect, useState } from "react";
import { IntentLink } from "@/components/intent-link";
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
import { timeOnDay, untimedOnDay } from "@/lib/event-time";
import { DayAgenda } from "./day-agenda";

const HOUR_H = 56;
const LABEL_MIN_GAP = 22;

type Props = { ymd: string; occurrences: Occurrence[]; prayer: PrayerTimes };

function localHourAndMinute(utc: Date): { h: number; m: number } {
  const hm = formatLocal(utc, "H:m").split(":");
  return { h: Number(hm[0]), m: Number(hm[1]) };
}

const DAY_MIN = 24 * 60;
const MIN_EVENT_H = 44; // also the minimum tap target
// A start-only event is drawn this long: its end is unknown, and stretching it
// to midnight would claim an end nobody announced.
const OPEN_END_MIN = 60;
// A timed event this long on one day leaves the hour grid for a row above it:
// drawn as a block it would cover the prayer times beneath, and every event
// beside it would be squeezed into a lane.
const LONG_MIN = 4 * 60;

function wallMinutes(utc: Date): number {
  const { h, m } = localHourAndMinute(utc);
  return h * 60 + m;
}

type Span = {
  o: Occurrence;
  start: number; // wall-clock minutes since local midnight, clipped to this day
  end: number;
};

type Placed = Span & { lane: number; lanes: number };

// Each timed occurrence clipped to this local day. Untimed events (see
// untimedOnDay) have no span: they sit in the row above the grid.
function spansOnDay(occurrences: Occurrence[], ymd: string): Span[] {
  return occurrences
    .filter((o) => !untimedOnDay(o, ymd))
    .map((o) => {
      const start = toLocalYmd(o.occurrenceStart) < ymd ? 0 : wallMinutes(o.occurrenceStart);
      const end =
        o.timing === "start_only"
          ? Math.min(start + OPEN_END_MIN, DAY_MIN)
          : toLocalYmd(o.occurrenceEnd) > ymd
            ? DAY_MIN
            : wallMinutes(o.occurrenceEnd);
      return { o, start, end: Math.max(end, start) };
    });
}

// Give events that overlap (visually, counting the minimum chip height) their
// own lane so none is hidden behind another.
function placeSpans(spans: Span[]): Placed[] {
  const minDur = (MIN_EVENT_H / HOUR_H) * 60;
  const items = spans
    .map((s) => ({ ...s, lane: 0, lanes: 1 }))
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

// A row above the hour grid: events listed with their time on this day.
function DayRow({ kind, label, items, ymd }: { kind: "untimed" | "long"; label: string; items: Occurrence[]; ymd: string }) {
  if (items.length === 0) return null;
  return (
    <div className={`day-grid__row day-grid__${kind}`}>
      <div className="day-grid__row-label">{label}</div>
      <ul className="flex flex-col gap-1.5">
        {items.map((o) => (
          <li key={`${o.eventId}-${o.occurrenceStart.toISOString()}`}>
            <IntentLink
              href={`/calendar/events/${o.eventId}?occurrence=${encodeURIComponent(o.occurrenceStart.toISOString())}`}
              className="day-grid__row-event"
            >
              <span className="truncate font-medium">{o.title}</span>
              <span className="shrink-0 text-xs text-ink/60">{timeOnDay(o, ymd)}</span>
            </IntentLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DayView({ ymd, occurrences, prayer }: Props) {
  const fajrUtc = parseHMInLocal(ymd, prayer.fajr);
  const ishaUtc = parseHMInLocal(ymd, prayer.isha);
  const spans = spansOnDay(occurrences, ymd);
  const long = spans.filter((s) => s.end - s.start >= LONG_MIN).map((s) => s.o);
  const placed = placeSpans(spans.filter((s) => s.end - s.start < LONG_MIN));
  const untimed = occurrences.filter((o) => untimedOnDay(o, ymd));
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

  // Set after mount only, so server and client markup match.
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);
  useEffect(() => {
    function update() {
      const now = new Date();
      setNowMinutes(toLocalYmd(now) === ymd ? wallMinutes(now) : null);
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
  }, [ymd]);
  const nowTopRaw = nowMinutes == null ? null : (nowMinutes / 60 - gridStart) * HOUR_H;
  const nowTop = nowTopRaw != null && nowTopRaw >= 0 && nowTopRaw <= bodyHeight ? nowTopRaw : null;

  return (
    <FadeIn>
      {/* Below md the grid's columns get too narrow for titles and
          overlapping lanes, so phones get a stacked agenda instead. */}
      <div className="md:hidden">
        <DayAgenda ymd={ymd} occurrences={occurrences} prayer={prayer} nowMinutes={nowMinutes} />
      </div>
      <div className="hidden md:block">
        <DayRow kind="untimed" label="No set time" items={untimed} ymd={ymd} />
        <DayRow kind="long" label="Long events" items={long} ymd={ymd} />
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
            ) : placed.length === 0 ? (
              long.length === 0 ? <div className="day-grid__empty">No timed events</div> : null
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
                  <IntentLink
                    key={`${o.eventId}-${o.occurrenceStart.toISOString()}`}
                    href={`/calendar/events/${o.eventId}?occurrence=${encodeURIComponent(o.occurrenceStart.toISOString())}`}
                    className="day-grid__event"
                    style={{ top, height, ...laneStyle }}
                    data-lane={`${lane + 1}/${lanes}`}
                    data-open-end={o.timing === "start_only" ? "" : undefined}
                  >
                    <div className="truncate font-medium leading-tight">{o.title}</div>
                    {showTime && (
                      <div className="truncate text-xs leading-tight text-ink/60">
                        {o.timing === "start_only"
                          ? `${formatLocal(o.occurrenceStart, "h:mm a")}, end not announced`
                          : `${formatLocal(o.occurrenceStart, "h:mm a")} – ${formatLocal(o.occurrenceEnd, "h:mm a")}`}
                      </div>
                    )}
                  </IntentLink>
                );
              })
            )}
          </div>
        </div>
      </div>
    </FadeIn>
  );
}
