import type { events } from "@/lib/db/schema";
import type { EventTiming } from "@/lib/event-rules";
import { coverThumb, type FlyerImage } from "@/lib/event-media";
import { timeOnDay } from "@/lib/event-time";
import { resolveOccurrence } from "@/lib/occurrence";
import { recurrenceSummary } from "@/lib/seo";
import { formatLocal, toLocalYmd } from "@/lib/time";
import { importLabel } from "@/components/admin/event-origin";


/** One line of the admin Events page: an event, a series once. Plain data for the client list. */
export type AdminEventRow = {
  id: string;
  title: string;
  location: string;
  /** The day it is listed under: a one-off's date; a series' next (or, once over, last) date. */
  ymd: string;
  dayLabel: string;
  /** Start in ms, for sorting. */
  at: number;
  time: string;
  upcoming: boolean;
  pattern: string | null;
  draft: boolean;
  cancelled: boolean;
  imported: string | null;
  thumb: FlyerImage | null;
};

type Row = typeof events.$inferSelect;

function dayLabel(ymd: string, at: Date, today: string, tomorrow: string, yesterday: string): string {
  const sameYear = ymd.slice(0, 4) === today.slice(0, 4);
  const date = formatLocal(at, sameYear ? "EEE, MMM d" : "EEE, MMM d, yyyy");
  if (ymd === today) return `Today · ${date}`;
  if (ymd === tomorrow) return `Tomorrow · ${date}`;
  if (ymd === yesterday) return `Yesterday · ${date}`;
  return date;
}

/**
 * The admin list's rows. Upcoming until it has ended (a series: until its
 * last occurrence has); upcoming soonest first, past newest first.
 */
export function adminEventRows(rows: Row[], now: Date): AdminEventRow[] {
  const day = 24 * 60 * 60 * 1000;
  const today = toLocalYmd(now);
  const tomorrow = toLocalYmd(new Date(now.getTime() + day));
  const yesterday = toLocalYmd(new Date(now.getTime() - day));
  const list = rows.map((r): AdminEventRow => {
    const timing = (r.timing ?? "timed") as EventTiming;
    const { start, end } = resolveOccurrence({ ...r, timing, cancellations: [] }, undefined, now);
    const ymd = toLocalYmd(start);
    return {
      id: r.id,
      title: r.title,
      location: r.location,
      ymd,
      dayLabel: dayLabel(ymd, start, today, tomorrow, yesterday),
      at: start.getTime(),
      time: timeOnDay({ occurrenceStart: start, occurrenceEnd: end, timing }, ymd),
      upcoming: end.getTime() >= now.getTime(),
      pattern: recurrenceSummary(r, start),
      draft: r.draft,
      cancelled: r.cancelledAt != null,
      imported: importLabel(r.source),
      thumb: coverThumb(r.images?.[0], r.title),
    };
  });
  return list.sort((a, b) => (a.upcoming === b.upcoming ? (a.upcoming ? a.at - b.at : b.at - a.at) : a.upcoming ? -1 : 1));
}
