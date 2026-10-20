import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ revalidatePath: vi.fn(), adminId: 0 }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("@/lib/auth", () => ({ requireAdminId: async () => h.adminId }));
vi.mock("@/lib/db/client", async () => {
  const { createTestDb } = await import("@/test/db");
  return { db: (await createTestDb()).db };
});

import { db } from "@/lib/db/client";
import { admins, users } from "@/lib/db/schema";
import { createEvent, deleteEvent, updateEvent } from "./_actions";

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
    expect(h.revalidatePath).toHaveBeenCalledWith(`/calendar/events/${id}`);

    h.revalidatePath.mockClear();
    await deleteEvent(id);
    expect(h.revalidatePath).toHaveBeenCalledWith("/");
  });
});
