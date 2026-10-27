import type { ReactNode } from "react";
import type { TimelineItem } from "@/lib/db/schema";
import { FormLink, StepText, timingLabel } from "./step-text";

/** "Fri, Nov 20" for a YYYY-MM-DD date, read as a calendar day (no time zone shift). */
export function formatDay(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * True when a step's own deadline (its lead time before the event) is already
 * behind today: the event is too close, or the date went by unticked.
 */
export function isBehind(item: TimelineItem, eventDate: string, today: string): boolean {
  if (item.done) return false;
  const ideal = new Date(Date.parse(`${eventDate}T00:00:00Z`) - item.leadDays * 86_400_000).toISOString().slice(0, 10);
  return ideal < today;
}

export function sortItems(items: TimelineItem[]): TimelineItem[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => (a.item.due === b.item.due ? a.i - b.i : a.item.due < b.item.due ? -1 : 1))
    .map((x) => x.item);
}

/** The dated steps of a timeline. `check` puts a checkbox in front of each; without it, done steps say so. */
export function TimelineList({
  items,
  eventDate,
  today,
  check,
}: {
  items: TimelineItem[];
  eventDate: string;
  today: string;
  check?: (item: TimelineItem) => ReactNode;
}) {
  const anyBehind = items.some((i) => isBehind(i, eventDate, today));
  return (
    <>
      {anyBehind ? (
        <p role="status" className="mb-3 rounded-xl border border-burgundy/30 px-3 py-3 text-sm text-burgundy">
          Some deadlines have passed; do these today.
        </p>
      ) : null}
      <ol className="space-y-3">
        {sortItems(items).map((item) => {
          const behind = isBehind(item, eventDate, today);
          const timing = timingLabel(item.leadDays);
          return (
            <li
              key={item.id}
              data-testid="timeline-item"
              className={`flex gap-2 rounded-xl border px-3 py-3 ${item.done ? "border-ink/5 bg-ink/[0.02]" : "border-ink/10"}`}
            >
              {check ? <div className="-ml-1 shrink-0">{check(item)}</div> : null}
              <div className="min-w-0 flex-1 py-2">
                <p className={`font-medium leading-snug ${item.done ? "text-dim line-through decoration-ink/30" : ""}`}>
                  {item.title}
                </p>
                <p className="mt-1 text-sm text-dim">
                  {behind ? (
                    <span className="text-burgundy">Do today</span>
                  ) : (
                    <>
                      {formatDay(item.due)}
                      {timing ? ` · ${timing}` : null}
                    </>
                  )}
                  {!check && item.done ? " · done" : null}
                </p>
                {item.whenNote ? <p className="mt-1 text-sm italic text-dim">{item.whenNote}</p> : null}
                {item.formUrl && !item.done ? (
                  <div className="mt-2">
                    <FormLink label={item.formLabel} url={item.formUrl} />
                  </div>
                ) : null}
                {item.body ? (
                  <details className="mt-1">
                    <summary className="flex min-h-11 cursor-pointer items-center text-sm text-burgundy">How to do it</summary>
                    <StepText text={item.body} className="pb-1 text-[15px]" />
                  </details>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

export function Progress({ items }: { items: TimelineItem[] }) {
  const done = items.filter((i) => i.done).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  return (
    <div className="mb-4">
      <p className="text-sm text-dim tabular-nums">
        {done} of {items.length} done
      </p>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink/10" aria-hidden>
        <div className="h-full rounded-full bg-ink/60 transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
