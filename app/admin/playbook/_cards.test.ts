import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import {
  admins,
  eventPlanSelections,
  eventTasks,
  events,
  guides,
  users,
} from "@/lib/db/schema";
import {
  archiveCard,
  cardHistory,
  listCards,
  reorderCards,
  restoreCard,
  saveCard,
} from "./_cards";
import { saveReviewedPlan } from "../plan/_agent-plan";
import { syncPlan, setTaskDone } from "../plan/_plan";
import { toLocalYmd, startOfLocalDayUtc } from "@/lib/time";
import type { CardInput, ReviewedPlan } from "@/lib/playbook";
import { documentBlocks, encodeDocument } from "@/lib/board-document";
const close: Array<() => void> = [];
afterEach(() => {
  for (const fn of close.splice(0)) fn();
});
async function setup() {
  const t = await createTestDb();
  close.push(() => t.client.close());
  await t.db.insert(users).values({ id: "editor", email: "editor@ucsc.edu" });
  const [admin] = await t.db
    .insert(admins)
    .values({ userId: "editor" })
    .returning();
  return { ...t, adminId: admin.id };
}
function input(c: CardInput): CardInput {
  return {
    title: c.title,
    body: c.body,
    tag: c.tag,
    daysBefore: c.daysBefore,
    dependencies: c.dependencies,
  };
}
const plan = (): ReviewedPlan => ({
  title: "Iftar",
  eventYmd: "2027-03-12",
  description: "80 people, food and room",
  tags: ["room", "food"],
  cardIds: ["room", "purchase"],
  requestId: crypto.randomUUID(),
});

describe("playbook cards and reviewed plans", () => {
  it("versions visual documents and restores the exact legacy guide", async () => {
    const { db } = await setup();
    const card = (await listCards(db)).find((c) => c.id === "room")!;
    const blocks = documentBlocks(card.body);
    blocks[0].children.push({
      type: "paragraph",
      props: {},
      content: [{ type: "text", text: "New subtask", styles: { bold: true } }],
      children: [],
    });
    const body = encodeDocument(blocks);
    expect(
      (
        await saveCard(
          db,
          card.id,
          { ...input(card), body },
          card.revision,
          "editor",
        )
      ).ok,
    ).toBe(true);
    expect((await listCards(db)).find((c) => c.id === card.id)?.body).toBe(
      body,
    );
    const versions = await cardHistory(db, card.id);
    expect(versions[0].snapshot.body).toBe(body);
    expect(
      (
        await restoreCard(
          db,
          card.id,
          versions[1].id,
          card.revision + 1,
          "editor",
        )
      ).ok,
    ).toBe(true);
    expect((await listCards(db)).find((c) => c.id === card.id)?.body).toBe(
      card.body,
    );
  });
  it("seeds exact current guide text and lead times without losing guide versions", async () => {
    const { db } = await setup();
    const cards = await listCards(db);
    expect(cards).toHaveLength(12);
    const [food] = await db
      .select()
      .from(guides)
      .where(eq(guides.slug, "food"));
    expect(cards.find((c) => c.id === "purchase")).toMatchObject({
      body: food.body,
      daysBefore: 10,
      dependencies: ["proposal", "vendor-204"],
    });
    expect((await cardHistory(db, "purchase"))[0].snapshot.body).toBe(
      food.body,
    );
  });
  it("saves a card, protects concurrent edits, and restores timing and dependencies as a new version", async () => {
    const { db } = await setup();
    const c = (await listCards(db)).find((c) => c.id === "purchase")!;
    expect(
      (
        await saveCard(
          db,
          c.id,
          {
            ...input(c),
            title: "Order dinner",
            daysBefore: 21,
            dependencies: [],
          },
          c.revision,
          "editor",
        )
      ).ok,
    ).toBe(true);
    expect((await saveCard(db, c.id, input(c), c.revision, "editor")).ok).toBe(
      false,
    );
    const history = await cardHistory(db, c.id);
    expect(history).toHaveLength(2);
    expect((await restoreCard(db, c.id, history[1].id, 2, "editor")).ok).toBe(
      true,
    );
    expect((await listCards(db)).find((x) => x.id === c.id)).toMatchObject({
      daysBefore: 10,
      dependencies: c.dependencies,
      revision: 3,
    });
    expect(await cardHistory(db, c.id)).toHaveLength(3);
  });
  it("rejects cycles and deletion of prerequisites, preserves deleted card history and restores it", async () => {
    const { db } = await setup();
    const cards = await listCards(db);
    const c = cards.find((c) => c.id === "proposal")!;
    expect(
      (
        await saveCard(
          db,
          c.id,
          { ...input(c), dependencies: ["purchase"] },
          c.revision,
          "editor",
        )
      ).ok,
    ).toBe(false);
    expect((await archiveCard(db, "proposal", 1, "editor")).ok).toBe(false);
    expect(
      (
        await saveCard(
          db,
          null,
          {
            title: "Attendance",
            body: "Keep the attendance log.",
            tag: null,
            daysBefore: 0,
            dependencies: [],
          },
          null,
          "editor",
        )
      ).ok,
    ).toBe(true);
    const added = (await listCards(db)).find((x) => x.title === "Attendance")!;
    expect((await archiveCard(db, added.id, 1, "editor")).ok).toBe(true);
    expect(
      (await listCards(db)).find((x) => x.id === added.id),
    ).toBeUndefined();
    expect((await listCards(db, true)).map((x) => x.id)).toContain(added.id);
    const [v] = await cardHistory(db, added.id);
    expect((await restoreCard(db, added.id, v.id, 2, "editor")).ok).toBe(true);
  });
  it("only reorders an exact current set and saves the order", async () => {
    const { db } = await setup();
    const ids = (await listCards(db)).map((c) => c.id);
    expect((await reorderCards(db, [...ids].reverse(), ids, "editor")).ok).toBe(
      true,
    );
    expect((await listCards(db)).map((c) => c.id)).toEqual([...ids].reverse());
    expect((await reorderCards(db, ids, ids, "editor")).ok).toBe(false);
    expect(
      (await reorderCards(db, [ids[0], ids[0]], [...ids].reverse(), "editor"))
        .ok,
    ).toBe(false);
  });
  it("persists a reviewed draft and prerequisite closure once, and redates only open tasks", async () => {
    const { db, adminId } = await setup();
    const p = plan();
    const created = await saveReviewedPlan(
      db,
      p,
      adminId,
      "2026-10-25",
      () => "event-plan",
    );
    expect(created).toEqual({ ok: true, eventId: "event-plan" });
    expect(
      await saveReviewedPlan(db, p, adminId, "2026-10-25", () => "duplicate"),
    ).toEqual(created);
    const [event] = await db
      .select()
      .from(events)
      .where(eq(events.id, "event-plan"));
    expect(event).toMatchObject({
      draft: true,
      timing: "date_only",
      createdByAdminId: adminId,
    });
    expect(toLocalYmd(event.startTime)).toBe(p.eventYmd);
    expect(await db.select().from(eventPlanSelections)).toHaveLength(1);
    const tasks = await db.select().from(eventTasks);
    expect(tasks.map((t) => t.templateId).sort()).toEqual([
      "proposal",
      "purchase",
      "room",
      "vendor-204",
    ]);
    const room = tasks.find((t) => t.templateId === "room")!;
    await setTaskDone(db, room.id, "editor", true);
    await db
      .update(events)
      .set({ startTime: startOfLocalDayUtc("2027-03-19") })
      .where(eq(events.id, event.id));
    await syncPlan(db, event.id);
    const after = await db.select().from(eventTasks);
    expect(after.find((t) => t.id === room.id)).toMatchObject({
      dueDate: room.dueDate,
      doneByUserId: "editor",
    });
    expect(after.find((t) => t.templateId === "purchase")?.dueDate).toBe(
      "2027-03-09",
    );
    const c = (await listCards(db)).find((c) => c.id === "purchase")!;
    await saveCard(
      db,
      c.id,
      { ...input(c), title: "Order dinner", daysBefore: 7 },
      c.revision,
      "editor",
    );
    expect(
      (await db.select().from(eventTasks)).find(
        (t) => t.templateId === "purchase",
      ),
    ).toMatchObject({ title: "Order dinner", dueDate: "2027-03-12" });
  });
  it("refuses deleted/unknown cards and past dates without writing a draft", async () => {
    const { db, adminId } = await setup();
    expect(
      (
        await saveReviewedPlan(
          db,
          { ...plan(), cardIds: ["unknown"] },
          adminId,
          "2026-10-25",
          () => "no",
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await saveReviewedPlan(
          db,
          { ...plan(), eventYmd: "2020-01-01" },
          adminId,
          "2026-10-25",
          () => "no",
        )
      ).ok,
    ).toBe(false);
    expect(await db.select().from(events)).toEqual([]);
    expect(
      (await listCards(db)).find((c) => c.id === "room")?.dependencies,
    ).toEqual(["proposal"]);
  });
});
