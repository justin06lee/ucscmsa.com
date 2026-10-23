import { beforeEach, describe, expect, it, vi } from "vitest";

// The admin event form's planning fields (draft, tags) through the real
// server actions, against a local database.

const h = vi.hoisted(() => ({ revalidatePath: vi.fn(), adminId: 0 }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("@/lib/auth", () => ({
  requireAdminId: async () => h.adminId,
  requireAdmin: async () => ({ user: { id: "u1", isAdmin: true, adminId: h.adminId } }),
}));
vi.mock("@/lib/db/client", async () => {
  const { createTestDb } = await import("@/test/db");
  return { db: (await createTestDb()).db };
});

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { admins, eventTags, eventTasks, events, users } from "@/lib/db/schema";
import { createEvent, updateEvent } from "./_actions";
import { publishEvent } from "./plan/_actions";

const ymd = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

function form(fields: Record<string, string | string[]>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
  }
  return fd;
}

const base = (date: string) => ({ title: "Bonfire", startDate: date, endDate: date, startTime: "18:00", endTime: "20:00" });

async function tasks(id: string) {
  const rows = await db.select().from(eventTasks).where(eq(eventTasks.eventId, id));
  return Object.fromEntries(rows.map((r) => [r.templateId, r]));
}

describe("event form planning fields", () => {
  beforeEach(async () => {
    if (h.adminId === 0) {
      await db.insert(users).values({ id: "u1", email: "a@ucsc.edu" });
      const [a] = await db.insert(admins).values({ userId: "u1" }).returning();
      h.adminId = a.id;
    }
    h.revalidatePath.mockClear();
  });

  it("creates a draft with tags, plans it, and sends the form to the checklist", async () => {
    const r = await createEvent(form({ ...base(ymd(30)), planning: "1", draft: "on", tags: ["room", "food", "bogus"] }));
    expect(r).toMatchObject({ ok: true, planned: true });
    const id = (r as { id: string }).id;
    const [ev] = await db.select().from(events).where(eq(events.id, id));
    expect(ev.draft).toBe(true);
    const tags = await db.select().from(eventTags).where(eq(eventTags.eventId, id));
    expect(tags.map((t) => t.tag).sort()).toEqual(["food", "room"]);
    expect(Object.keys(await tasks(id)).sort()).toEqual(["advisor", "flyer", "promo-eve", "promo-week", "proposal", "purchase", "room", "vendor-204"]);
    expect(h.revalidatePath).toHaveBeenCalledWith(`/admin/plan/${id}`);
  });

  it("moving the date in the form moves open tasks, even from a form without planning fields", async () => {
    const r = await createEvent(form({ ...base(ymd(30)), planning: "1", tags: ["room"] }));
    const id = (r as { id: string }).id;
    const before = await tasks(id);
    // An older copy of the form: no planning fields. Draft and tags stay.
    expect(await updateEvent(id, form(base(ymd(37))))).toMatchObject({ ok: true, planned: true });
    const after = await tasks(id);
    expect(after.room.dueDate > before.room.dueDate).toBe(true);
    const tags = await db.select().from(eventTags).where(eq(eventTags.eventId, id));
    expect(tags.map((t) => t.tag)).toEqual(["room"]);
  });

  it("saving an ordinary event through the form (not a draft, no tags) doesn't plan it", async () => {
    const r = await createEvent(form({ ...base(ymd(15)), planning: "1" }));
    expect(r).toMatchObject({ ok: true, planned: false });
    const id = (r as { id: string }).id;
    expect(await updateEvent(id, form({ ...base(ymd(16)), planning: "1" }))).toMatchObject({ ok: true, planned: false });
    expect(await tasks(id)).toEqual({});
  });

  it("an event made without planning fields is public and unplanned, as before", async () => {
    const r = await createEvent(form(base(ymd(10))));
    expect(r).toMatchObject({ ok: true, planned: false });
    const [ev] = await db.select().from(events).where(eq(events.id, (r as { id: string }).id));
    expect(ev.draft).toBe(false);
  });

  it("publishing a draft makes it public and refreshes the public pages", async () => {
    const r = await createEvent(form({ ...base(ymd(20)), planning: "1", draft: "on" }));
    const id = (r as { id: string }).id;
    expect(await publishEvent(id)).toEqual({ ok: true });
    const [ev] = await db.select().from(events).where(eq(events.id, id));
    expect(ev.draft).toBe(false);
    for (const p of ["/", "/calendar", "/sitemap.xml"]) {
      expect(h.revalidatePath).toHaveBeenCalledWith(p);
    }
    // "layout" takes the event's share image with its page.
    expect(h.revalidatePath).toHaveBeenCalledWith(`/calendar/events/${id}`, "layout");
    expect(await publishEvent("missing")).toEqual({ ok: false, error: "not_found" });
  });

  it("putting a published event back to draft refreshes its page, share image and the sitemap", async () => {
    const r = await createEvent(form({ ...base(ymd(20)), planning: "1" }));
    const id = (r as { id: string }).id;
    h.revalidatePath.mockClear();
    await updateEvent(id, form({ ...base(ymd(20)), planning: "1", draft: "on" }));
    expect(h.revalidatePath).toHaveBeenCalledWith(`/calendar/events/${id}`, "layout");
    expect(h.revalidatePath).toHaveBeenCalledWith("/sitemap.xml");
  });

  it("saving an event that no longer exists changes nothing", async () => {
    const r = await updateEvent("01JAAAAAAAAAAAAAAAAAAAAAAA", form({ ...base(ymd(20)), planning: "1", tags: ["room"] }));
    expect(r).toEqual({ ok: false, error: "not_found" });
    const tags = await db.select().from(eventTags).where(eq(eventTags.eventId, "01JAAAAAAAAAAAAAAAAAAAAAAA"));
    expect(tags).toEqual([]);
  });

  it("unticking Draft in the form publishes it too", async () => {
    const r = await createEvent(form({ ...base(ymd(20)), planning: "1", draft: "on" }));
    const id = (r as { id: string }).id;
    await updateEvent(id, form({ ...base(ymd(20)), planning: "1" }));
    const [ev] = await db.select().from(events).where(eq(events.id, id));
    expect(ev.draft).toBe(false);
  });
});
