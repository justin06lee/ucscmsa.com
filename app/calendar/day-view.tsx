"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Image from "next/image";
import { MapPin } from "lucide-react";
import { IntentLink } from "@/components/intent-link";
import type { Occurrence } from "@/lib/rrule-lite";
import { coverThumb, type FlyerImage } from "@/lib/event-media";
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

// The tallest an hour gets. On screen the grid's hours shrink (to 36px) so a
// whole day, Fajr to Isha, fits a laptop screen: --hour-h in globals.css.
// Positions are in hours, scaled by that variable (at).
const HOUR_H = 56;
const LABEL_MIN_GAP = 22;

/** A length of `hours` on the grid, in CSS. */
function at(hours: number): string {
  return `calc(${Number(hours.toFixed(4))} * var(--hour-h))`;
}

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

function RowFlyer({ image }: { image: FlyerImage | null }) {
  if (!image) return null;
  return (
    <span className="day-grid__row-flyer" aria-hidden="true">
      <Image src={image.src} width={image.width} height={image.height} alt="" unoptimized loading="lazy" />
    </span>
  );
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
              <span className="flex min-w-0 items-center gap-2.5">
                <RowFlyer image={coverThumb(o.cover, o.title)} />
                <span className="truncate font-medium">{o.title}</span>
              </span>
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

  const prayerMarkers = [
    { label: "Fajr", hm: prayer.fajr },
    { label: "Sunrise", hm: prayer.sunrise },
    { label: "Dhuhr", hm: prayer.dhuhr },
    { label: "Asr", hm: prayer.asr },
    { label: "Maghrib", hm: prayer.maghrib },
    { label: "Isha", hm: prayer.isha },
  ].map((p) => {
    const { h, m } = localHourAndMinute(parseHMInLocal(ymd, p.hm));
    return { ...p, lineTop: h - gridStart + m / 60 };
  });

  // Labels never closer than LABEL_MIN_GAP px, at whatever height an hour is:
  // each one at its line or just under the one before, whichever is lower.
  const sortedByTop = [...prayerMarkers].sort((a, b) => a.lineTop - b.lineTop);
  const labelTopByKey = new Map<string, string>();
  let lastLabelTop: string | null = null;
  for (const p of sortedByTop) {
    const top: string = lastLabelTop
      ? `max(${at(p.lineTop)}, calc(${lastLabelTop} + ${LABEL_MIN_GAP}px))`
      : at(p.lineTop);
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
  const nowTopRaw = nowMinutes == null ? null : nowMinutes / 60 - gridStart;
  const nowTop = nowTopRaw != null && nowTopRaw >= 0 && nowTopRaw <= hours.length ? at(nowTopRaw) : null;

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
          style={{ "--hours": hours.length, gridTemplateRows: `repeat(${hours.length}, var(--hour-h))` } as CSSProperties}
        >
          {hours.map((h) => (
            <div key={`label-${h}`} className="day-grid__hour">
              {localHourLabel(h)}
            </div>
          ))}
          <div
            className="day-grid__body"
            style={{ gridRow: `1 / span ${hours.length}`, height: at(hours.length) }}
          >
            {prayerMarkers.map((p) => (
              <div
                key={`line-${p.label}`}
                className="day-grid__prayer-line"
                style={{ top: at(p.lineTop) }}
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
                const top = start / 60 - gridStart;
                const length = Math.min((end - start) / 60, hours.length - top);
                const laneStyle =
                  lanes > 1
                    ? {
                        left: `calc(8px + (100% - 16px) * ${lane / lanes})`,
                        width: `calc((100% - 16px) / ${lanes} - 4px)`,
                        right: "auto",
                      }
                    : null;
                const flyer = coverThumb(o.cover, o.title);
                return (
                  <IntentLink
                    key={`${o.eventId}-${o.occurrenceStart.toISOString()}`}
                    href={`/calendar/events/${o.eventId}?occurrence=${encodeURIComponent(o.occurrenceStart.toISOString())}`}
                    className="day-grid__event"
                    style={{ top: at(top), height: `max(${MIN_EVENT_H}px, ${at(length)})`, ...laneStyle }}
                    data-lane={`${lane + 1}/${lanes}`}
                    data-at={Number(top.toFixed(4))}
                    data-hours={Number(length.toFixed(4))}
                    data-open-end={o.timing === "start_only" ? "" : undefined}
                    data-flyer={flyer ? "" : undefined}
                  >
                    {flyer ? (
                      <>
                        {/* The flyer, blurred, tints the block; the flyer itself sits on its left. */}
                        <Image src={flyer.src} width={flyer.width} height={flyer.height} alt="" unoptimized loading="lazy" aria-hidden="true" className="day-grid__event-glow" />
                        <span className="day-grid__event-flyer" aria-hidden="true">
                          <Image src={flyer.src} width={flyer.width} height={flyer.height} alt="" unoptimized loading="lazy" />
                        </span>
                      </>
                    ) : null}
                    <span className="day-grid__event-text">
                      <span className="truncate font-medium leading-tight">{o.title}</span>
                      <span className="day-grid__event-time truncate text-xs leading-tight text-ink/65">
                        {o.timing === "start_only"
                          ? `${formatLocal(o.occurrenceStart, "h:mm a")}, end not announced`
                          : `${formatLocal(o.occurrenceStart, "h:mm a")} – ${formatLocal(o.occurrenceEnd, "h:mm a")}`}
                      </span>
                      {o.location ? (
                        <span className="day-grid__event-place truncate text-xs leading-tight text-ink/65">
                          <MapPin size={11} aria-hidden="true" className="mr-1 inline-block align-[-1px]" />
                          {o.location}
                        </span>
                      ) : null}
                    </span>
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
