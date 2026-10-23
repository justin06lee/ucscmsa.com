import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { events, eventTasks } from "@/lib/db/schema";
import { applyImport } from "@/lib/import/apply";
import { planFromForm } from "@/app/admin/plan/_plan";
import { addDaysYmd } from "@/lib/planning";
import { parseHMInLocal, toLocalYmd } from "@/lib/time";

// An imported event an admin tagged for planning: when a later import moves
// its date, the open tasks move with it and the done ones stay.
describe("import upsert of a planned event", () => {
  it("re-dates its open tasks", async () => {
    const { db } = await createTestDb();
    const day = toLocalYmd(new Date(Date.now() + 30 * 86_400_000));
    await db.insert(events).values({
      id: "ev-imported",
      title: "Game Night",
      startTime: parseHMInLocal(day, "18:00"),
      endTime: parseHMInLocal(day, "20:00"),
      source: "whatsapp",
      sourceId: "wa-1",
    });
    await planFromForm(db, "ev-imported", { tags: ["room", "food"], recurring: false });
    await db.update(eventTasks).set({ doneAt: new Date() }).where(eq(eventTasks.templateId, "purchase"));
    const due = async () =>
      Object.fromEntries(
        (await db.select().from(eventTasks).where(eq(eventTasks.eventId, "ev-imported"))).map((t) => [t.templateId, t.dueDate]),
      );
    const before = await due();

    const moved = addDaysYmd(day, 7);
    const out = await applyImport(db, {
      source: "whatsapp",
      operations: [{ op: "upsert", sourceId: "wa-1", event: { title: "Game Night", date: moved, startTime: "18:00", endTime: "20:00" } }],
    });
    expect(out.results[0]).toMatchObject({ status: "updated", eventId: "ev-imported" });

    const after = await due();
    expect(after.room).toBe(addDaysYmd(moved, -14));
    expect(after["promo-week"]).toBe(addDaysYmd(moved, -14));
    // Done tasks keep their date.
    expect(after.purchase).toBe(before.purchase);
  });
});
