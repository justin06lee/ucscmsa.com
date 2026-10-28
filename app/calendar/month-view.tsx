import Image from "next/image";
import { IntentLink } from "@/components/intent-link";
import type { Occurrence } from "@/lib/rrule-lite";
import { coverThumb } from "@/lib/event-media";
import { monthGridDays, toLocalYmd, formatLocal, parseHMInLocal } from "@/lib/time";
import { FadeIn } from "@/components/fade-in";
import { MonthAgenda } from "./month-agenda";

type Props = { ymd: string; occurrences: Occurrence[] };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * How many of a day's n flyers fit in `cap` slots: all of them, or cap - 1
 * and a "+k" tile for the rest.
 */
export function fitFlyers(n: number, cap: number): { shown: number; more: number } {
  return n <= cap ? { shown: n, more: 0 } : { shown: cap - 1, more: n - (cap - 1) };
}

// The tile is the size container, so the letter and "+k" inside scale with it.
const tile = "@container relative block aspect-[4/5] overflow-hidden rounded-[4px] border border-ink/10";

/** A day's event as a tiny flyer (an initial on a tone when it has none). */
function MiniFlyer({ o, dim }: { o: Occurrence; dim: boolean }) {
  const img = coverThumb(o.cover, o.title);
  return (
    <span
      title={o.title}
      data-mini-flyer=""
      className={`${tile} bg-paper shadow-[0_1px_2px_rgb(21_19_18/0.08)] transition-transform group-hover:-translate-y-px ${dim ? "opacity-45" : ""}`}
    >
      {img ? (
        <Image
          src={img.src}
          width={img.width}
          height={img.height}
          alt=""
          unoptimized
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-linear-to-b from-burgundy-soft/70 to-burgundy-soft/30 font-display text-[55cqw] leading-none text-burgundy">
          {o.title.trim().charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  );
}

function MoreTile({ more }: { more: number }) {
  return (
    <span className={`${tile} bg-ink/[0.05]`}>
      <span className="flex h-full w-full items-center justify-center text-[34cqw] font-medium tabular-nums text-ink/70">
        +{more}
      </span>
    </span>
  );
}

/** A day's flyers in `cap` slots, the last one "+k" when they don't all fit. */
function FlyerRow({ events, cap, dim, className }: { events: Occurrence[]; cap: number; dim: boolean; className: string }) {
  const { shown, more } = fitFlyers(events.length, cap);
  return (
    <span aria-hidden="true" className={className}>
      {events.slice(0, shown).map((o) => (
        <MiniFlyer key={`${o.eventId}-${o.occurrenceStart.toISOString()}`} o={o} dim={dim} />
      ))}
      {more > 0 ? <MoreTile more={more} /> : null}
    </span>
  );
}

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
          <div key={d} className="px-1 py-2 text-center font-medium sm:px-3 sm:text-left">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 border border-ink/10 rounded-lg overflow-hidden bg-paper">
        {grid.map(({ ymd: cellYmd, inMonth }, i) => {
          const dayEvents = byDay.get(cellYmd) ?? [];
          const isToday = cellYmd === todayYmd;
          const dayNum = Number(cellYmd.split("-")[2]);
          const col = i % 7;
          const row = Math.floor(i / 7);
          const n = dayEvents.length;
          // The flyers are pictures, so the link names the events in words.
          const label = `${formatLocal(parseHMInLocal(cellYmd, "12:00"), "EEEE, MMMM d")}, ${
            n === 0 ? "no events" : `${n} event${n === 1 ? "" : "s"}: ${dayEvents.map((o) => o.title).join(", ")}`
          }`;
          return (
            <IntentLink
              key={cellYmd}
              href={`/calendar?view=day&date=${cellYmd}`}
              aria-label={label}
              aria-current={isToday ? "date" : undefined}
              className={`
                group relative min-h-14 px-1 py-1.5 flex flex-col items-center gap-1 transition-colors
                sm:min-h-32 sm:items-stretch sm:px-3 sm:py-2
                ${inMonth ? "text-ink hover:bg-ink/[0.04]" : "text-dim bg-ink/[0.015]"}
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
                  <span className={`text-sm ${inMonth ? "font-medium" : ""}`}>
                    {dayNum}
                  </span>
                )}
              </div>
              {/* Each day's events as tiny flyers (Justin's ask): one on phones,
                  where cells are ~50px wide and the month's events are listed
                  under the grid, two from sm, three from lg. */}
              {n > 0 && (
                <>
                  <span aria-hidden="true" className="flex w-full items-center justify-center gap-0.5 sm:hidden">
                    <span className="w-[22px]">
                      <MiniFlyer o={dayEvents[0]} dim={!inMonth} />
                    </span>
                    {n > 1 ? <span className="text-[10px] font-medium leading-none text-dim">+{n - 1}</span> : null}
                  </span>
                  <FlyerRow events={dayEvents} cap={2} dim={!inMonth} className="hidden grid-cols-2 gap-1.5 sm:grid lg:hidden" />
                  <FlyerRow events={dayEvents} cap={3} dim={!inMonth} className="hidden grid-cols-3 gap-1.5 lg:grid" />
                </>
              )}
            </IntentLink>
          );
        })}
      </div>
      <MonthAgenda ymd={ymd} occurrences={occurrences} className="mt-8 sm:hidden" />
    </FadeIn>
  );
}
