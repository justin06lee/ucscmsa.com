import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { timelines } from "@/lib/db/schema";
import {
  calendarConfigFromEnv,
  deleteCalendarEvent,
  eventIdFor,
  putCalendarEvent,
  type CalendarConfig,
} from "@/lib/gcal";

/**
 * The event to remove for a timeline. After a failed sync Google may have made
 * the event without our hearing back, so try the id it was asked to use.
 */
export function eventToRemove(t: { id: string; googleEventId: string | null; calendarDirty: boolean }): string | null {
  return t.googleEventId ?? (t.calendarDirty ? eventIdFor(t.id) : null);
}

export type SyncResult = "off" | "ok" | "failed";

/**
 * Make the MSA calendar match the timeline: its event there when it's on the
 * calendar, none when it's off. A failure marks it dirty for the daily retry.
 */
export async function syncTimelineCalendar(
  db: DB,
  timelineId: string,
  cfg: CalendarConfig | null = calendarConfigFromEnv(),
  fetchImpl: typeof fetch = fetch,
): Promise<SyncResult> {
  if (!cfg) return "off";
  const [t] = await db
    .select({
      id: timelines.id,
      title: timelines.title,
      eventDate: timelines.eventDate,
      onCalendar: timelines.onCalendar,
      googleEventId: timelines.googleEventId,
      calendarDirty: timelines.calendarDirty,
    })
    .from(timelines)
    .where(eq(timelines.id, timelineId));
  if (!t) return "ok";
  try {
    if (t.onCalendar) {
      const googleEventId = await putCalendarEvent(cfg, t, fetchImpl);
      await db.update(timelines).set({ googleEventId, calendarDirty: false }).where(eq(timelines.id, t.id));
    } else {
      const stale = eventToRemove(t);
      if (stale) await deleteCalendarEvent(cfg, stale, fetchImpl);
      await db.update(timelines).set({ googleEventId: null, calendarDirty: false }).where(eq(timelines.id, t.id));
    }
    return "ok";
  } catch (err) {
    console.error("MSA calendar sync failed", t.id, err);
    await db.update(timelines).set({ calendarDirty: true }).where(eq(timelines.id, t.id));
    return "failed";
  }
}

/** Remove a timeline's event before the timeline itself is deleted. False when Google couldn't be reached. */
export async function removeCalendarEvent(
  googleEventId: string | null,
  cfg: CalendarConfig | null = calendarConfigFromEnv(),
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!cfg || !googleEventId) return true;
  try {
    await deleteCalendarEvent(cfg, googleEventId, fetchImpl);
    return true;
  } catch (err) {
    console.error("MSA calendar delete failed", googleEventId, err);
    return false;
  }
}

/** The daily retry of syncs that failed. */
export async function retryCalendarSyncs(
  db: DB,
  cfg: CalendarConfig | null = calendarConfigFromEnv(),
  fetchImpl: typeof fetch = fetch,
) {
  const result = { ok: 0, failed: 0 };
  if (!cfg) return result;
  const dirty = await db.select({ id: timelines.id }).from(timelines).where(eq(timelines.calendarDirty, true));
  for (const { id } of dirty) {
    if ((await syncTimelineCalendar(db, id, cfg, fetchImpl)) === "ok") result.ok++;
    else result.failed++;
  }
  return result;
}
