import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { db } from "@/lib/db/client";
import { admins, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { events } from "@/lib/db/schema";
import { approveNomination, createEvent, deleteEvent, setEventCancelled, updateEvent } from "./_actions";

function eventForm(title: string) {
  const fd = new FormData();
  for (const [k, v] of Object.entries({
    title,
    startDate: "2026-10-23",
    startTime: "13:30",
    endDate: "2026-10-23",
    endTime: "14:30",
  })) fd.set(k, v);
  return fd;
}

describe("event actions", () => {
  beforeEach(async () => {
    if (h.adminId === 0) {
      await db.insert(users).values({ id: "u1", email: "a@ucsc.edu" });
      const [a] = await db.insert(admins).values({ userId: "u1" }).returning();
      h.adminId = a.id;
    }
    h.revalidatePath.mockClear();
  });

  it("refresh the landing page's upcoming events on create, update and delete", async () => {
    const created = await createEvent(eventForm("Jummah"));
    expect(created.ok).toBe(true);
    const id = (created as { id: string }).id;
    expect(h.revalidatePath).toHaveBeenCalledWith("/");

    h.revalidatePath.mockClear();
    expect((await updateEvent(id, eventForm("Jummah prayer"))).ok).toBe(true);
    expect(h.revalidatePath).toHaveBeenCalledWith("/");
    // "layout": the event page and its share image.
    expect(h.revalidatePath).toHaveBeenCalledWith(`/calendar/events/${id}`, "layout");

    h.revalidatePath.mockClear();
    await deleteEvent(id);
    expect(h.revalidatePath).toHaveBeenCalledWith("/");
  });
});

describe("setEventCancelled", () => {
  it("cancels and restores an event as an admin edit, refreshing its pages", async () => {
    if (h.adminId === 0) {
      await db.insert(users).values({ id: "u2", email: "b@ucsc.edu" });
      h.adminId = (await db.insert(admins).values({ userId: "u2" }).returning())[0].id;
    }
    const created = await createEvent(eventForm("Bonfire"));
    const id = (created as { id: string }).id;
    h.revalidatePath.mockClear();

    const off = await setEventCancelled(id, true);
    expect(off).toEqual({ ok: true, cancelledAt: expect.any(String) });
    const [row] = await db.select().from(events).where(eq(events.id, id));
    expect(row.cancelledAt).toBeInstanceOf(Date);
    // The importer leaves admin-edited events alone (lib/import/apply.ts).
    expect(row.adminEditedAt).toBeInstanceOf(Date);
    expect(h.revalidatePath).toHaveBeenCalledWith(`/calendar/events/${id}`, "layout");

    expect(await setEventCancelled(id, false)).toEqual({ ok: true, cancelledAt: null });
    expect((await db.select().from(events).where(eq(events.id, id)))[0].cancelledAt).toBeNull();
  });

  it("answers a missing event or a bad request with a sentence, not a throw", async () => {
    expect(await setEventCancelled("no-such-event", true)).toEqual({ ok: false, code: "not_found", error: "That event no longer exists." });
    expect(await setEventCancelled("", true)).toMatchObject({ ok: false, code: "invalid" });
    expect(await setEventCancelled("x", "yes" as unknown as boolean)).toMatchObject({ ok: false, code: "invalid" });
  });
});

describe("failures the optimistic UI rolls back on", () => {
  beforeEach(async () => {
    if (h.adminId === 0) {
      await db.insert(users).values({ id: "u3", email: "c@ucsc.edu" });
      h.adminId = (await db.insert(admins).values({ userId: "u3" }).returning())[0].id;
    }
  });

  it("come back as { ok: false, code, error } with a sentence, not a throw", async () => {
    const created = await createEvent(eventForm("Picnic"));
    const id = (created as { id: string }).id;
    expect(await deleteEvent(id)).toEqual({ ok: true });
    expect(await deleteEvent(id)).toEqual({ ok: false, code: "not_found", error: "That event no longer exists." });
    expect(await approveNomination("no-such-nomination")).toEqual({
      ok: false, code: "not_found", error: "That nomination no longer exists.",
    });
  });
});
