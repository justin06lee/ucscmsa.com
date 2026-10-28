import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { setupBoard } from "@/test/board";
import { fakeGoogle } from "@/test/fake-google";
import { timelines } from "@/lib/db/schema";
import { eventIdFor, resetCalendarTokens } from "@/lib/gcal";
import { eventToRemove, removeCalendarEvent, retryCalendarSyncs, syncTimelineCalendar } from "@/lib/calendar-sync";

let open: { client: { close(): void } } | null = null;
beforeEach(() => resetCalendarTokens());
afterEach(() => {
  open?.client.close();
  open = null;
});

async function board() {
  const t = await setupBoard();
  open = t;
  const g = fakeGoogle();
  const set = (v: Partial<typeof timelines.$inferInsert>) => t.db.update(timelines).set(v).where(eq(timelines.id, t.tl.id));
  const row = async () => (await t.db.select().from(timelines).where(eq(timelines.id, t.tl.id)))[0];
  const sync = () => syncTimelineCalendar(t.db, t.tl.id, g.config, g.fetch);
  return { ...t, g, set, row, sync };
}

describe("syncTimelineCalendar", () => {
  it("does nothing while the MSA calendar isn't connected", async () => {
    const { db, tl, set } = await board();
    await set({ onCalendar: true });
    expect(await syncTimelineCalendar(db, tl.id, null)).toBe("off");
  });

  it("puts the timeline on, keeps it current, and takes it off", async () => {
    const { g, set, row, sync } = await board();
    await set({ onCalendar: true });
    expect(await sync()).toBe("ok");
    const id = (await row()).googleEventId!;
    expect(g.live()).toEqual([expect.objectContaining({ id, summary: "Bake Sale", start: { date: "2026-12-03" } })]);

    await set({ title: "Bake Sale and Chai", eventDate: "2026-12-04" });
    expect(await sync()).toBe("ok");
    expect(g.live()).toEqual([expect.objectContaining({ id, summary: "Bake Sale and Chai", start: { date: "2026-12-04" } })]);

    await set({ onCalendar: false });
    expect(await sync()).toBe("ok");
    expect(g.live()).toEqual([]);
    expect(await row()).toMatchObject({ googleEventId: null, calendarDirty: false });
  });

  it("marks a failed sync and the morning retry finishes it", async () => {
    const { db, g, set, row, sync } = await board();
    await set({ onCalendar: true });
    g.state.down = true;
    expect(await sync()).toBe("failed");
    expect(await row()).toMatchObject({ calendarDirty: true, googleEventId: null });
    g.state.down = false;
    expect(await retryCalendarSyncs(db, g.config, g.fetch)).toEqual({ ok: 1, failed: 0 });
    expect(await row()).toMatchObject({ calendarDirty: false });
    expect(g.live()).toHaveLength(1);
  });

  it("removes an event Google made even though its reply never arrived", async () => {
    const { tl, g, set, row, sync } = await board();
    await set({ onCalendar: true });
    // Google makes the event, then the connection drops before its reply.
    g.state.loseNextReply = true;
    expect(await sync()).toBe("failed");
    expect(g.live().map((e) => e.id)).toEqual([eventIdFor(tl.id)]);
    expect(eventToRemove(await row())).toBe(eventIdFor(tl.id));

    await set({ onCalendar: false });
    expect(await sync()).toBe("ok");
    expect(g.live()).toEqual([]);
  });
});

describe("removeCalendarEvent", () => {
  it("says whether the event is off the calendar", async () => {
    const { g, set, row, sync } = await board();
    await set({ onCalendar: true });
    await sync();
    const id = (await row()).googleEventId;
    expect(await removeCalendarEvent(null, g.config, g.fetch)).toBe(true);
    expect(await removeCalendarEvent(id, null, g.fetch)).toBe(true);
    g.state.down = true;
    expect(await removeCalendarEvent(id, g.config, g.fetch)).toBe(false);
    g.state.down = false;
    expect(await removeCalendarEvent(id, g.config, g.fetch)).toBe(true);
    expect(g.live()).toEqual([]);
  });
});
