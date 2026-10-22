import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { admins, eventTasks, events, taskTemplates, users } from "@/lib/db/schema";
import { parseHMInLocal } from "@/lib/time";
import {
  assignTask,
  boardMembers,
  getOverview,
  getTimeline,
  planFromForm,
  setTaskDone,
  syncAllPlans,
  syncPlan,
} from "./_plan";

type TestDb = Awaited<ReturnType<typeof createTestDb>>["db"];

// "Now" for these tests: Wed Oct 21 2026, 10 AM in Santa Cruz.
const NOW = parseHMInLocal("2026-10-21", "10:00");

async function setup() {
  const t = await createTestDb();
  await t.db.insert(users).values([
    { id: "u-aisha", email: "aisha@ucsc.edu", name: "Aisha Karim" },
    { id: "u-omar", email: "omar@ucsc.edu", name: null },
    { id: "u-visitor", email: "visitor@ucsc.edu", name: "Visitor" },
  ]);
  await t.db.insert(admins).values([{ userId: "u-aisha" }, { userId: "u-omar" }]);
  return t;
}

async function addEvent(db: TestDb, id: string, ymd: string, extra: Partial<typeof events.$inferInsert> = {}) {
  await db.insert(events).values({
    id,
    title: `Event ${id}`,
    startTime: parseHMInLocal(ymd, "18:00"),
    endTime: parseHMInLocal(ymd, "20:00"),
    ...extra,
  });
}

async function tasksOf(db: TestDb, eventId: string) {
  const rows = await db.select().from(eventTasks).where(eq(eventTasks.eventId, eventId));
  return Object.fromEntries(rows.map((r) => [r.templateId, r])) as Record<string, (typeof rows)[number]>;
}

describe("planning against the database (migration 0005 seeds)", () => {
  it("plans a new one-off event from its tags, with the seeded lead times", async () => {
    const { db, client } = await setup();
    await addEvent(db, "e1", "2026-11-20");
    await planFromForm(db, "e1", { tags: ["room", "food", "funding", "big"], recurring: false }, NOW);
    const t = await tasksOf(db, "e1");
    expect(Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.dueDate]))).toEqual({
      funding: "2026-10-30",
      proposal: "2026-10-30",
      advisor: "2026-11-06",
      room: "2026-11-06",
      purchase: "2026-11-13",
      "promo-week": "2026-11-13",
      "promo-eve": "2026-11-19",
    });
    client.close();
  });

  it("gives a draft the promotion tasks, but no plan to an untagged published, repeating or past event", async () => {
    const { db, client } = await setup();
    await addEvent(db, "plain", "2026-11-20", { draft: true });
    await addEvent(db, "published", "2026-11-20");
    await addEvent(db, "weekly", "2026-11-20", { recurrenceFreq: "weekly", recurrenceByWeekday: "FR" });
    await addEvent(db, "past", "2026-10-01");
    for (const id of ["plain", "published", "weekly", "past"]) {
      await planFromForm(db, id, { tags: [], draft: id !== "published", recurring: id === "weekly" }, NOW);
    }
    expect(Object.keys(await tasksOf(db, "plain")).sort()).toEqual(["promo-eve", "promo-week"]);
    // Saving an ordinary event through the form doesn't start a checklist.
    expect(await tasksOf(db, "published")).toEqual({});
    expect(await tasksOf(db, "weekly")).toEqual({});
    expect(await tasksOf(db, "past")).toEqual({});
    client.close();
  });

  it("an event that's too soon shows its tasks overdue on the timeline", async () => {
    const { db, client } = await setup();
    await addEvent(db, "soon", "2026-10-27");
    await planFromForm(db, "soon", { tags: ["funding", "room"], recurring: false }, NOW);
    const tl = (await getTimeline(db, "soon", NOW))!;
    expect(tl.todayYmd).toBe("2026-10-21");
    expect(tl.tasks.map((x) => [x.title, x.state])).toEqual([
      ["Apply for funding", "overdue"],
      ["Book a room", "overdue"],
      ["Post on Instagram and WhatsApp", "overdue"],
      ["Post a reminder", "open"],
    ]);
    expect(tl.tasks[0].guide).toEqual({ slug: "funding", title: "Get funding" });
    client.close();
  });

  it("moving the event re-dates open tasks; done ones stay done and dated", async () => {
    const { db, client } = await setup();
    await addEvent(db, "e1", "2026-11-20");
    await planFromForm(db, "e1", { tags: ["room"], recurring: false }, NOW);
    const before = await tasksOf(db, "e1");
    await setTaskDone(db, before.room.id, "u-aisha", true);

    await db
      .update(events)
      .set({ startTime: parseHMInLocal("2026-12-04", "18:00"), endTime: parseHMInLocal("2026-12-04", "20:00") })
      .where(eq(events.id, "e1"));
    await syncPlan(db, "e1");

    const after = await tasksOf(db, "e1");
    expect(after.room.dueDate).toBe("2026-11-06");
    expect(after.room.doneAt).not.toBeNull();
    expect(after.room.doneByUserId).toBe("u-aisha");
    expect(after["promo-week"].dueDate).toBe("2026-11-27");
    expect(after["promo-eve"].dueDate).toBe("2026-12-03");

    // Unticked, it is open again and follows the new date.
    await setTaskDone(db, before.room.id, "u-aisha", false);
    expect((await tasksOf(db, "e1")).room).toMatchObject({ dueDate: "2026-11-20", doneAt: null, doneByUserId: null });
    client.close();
  });

  it("taking a tag off removes its open tasks and never a done one", async () => {
    const { db, client } = await setup();
    await addEvent(db, "e1", "2026-11-20");
    await planFromForm(db, "e1", { tags: ["big", "food"], recurring: false }, NOW);
    const t = await tasksOf(db, "e1");
    await setTaskDone(db, t.proposal.id, "u-omar", true);
    await assignTask(db, t.advisor.id, "u-aisha");

    await planFromForm(db, "e1", { tags: ["food"], recurring: false }, NOW);
    const after = await tasksOf(db, "e1");
    expect(Object.keys(after).sort()).toEqual(["promo-eve", "promo-week", "proposal", "purchase"]);
    expect(after.proposal.doneAt).not.toBeNull();

    // Back on: only what's missing comes back.
    await planFromForm(db, "e1", { tags: ["food", "big"], recurring: false }, NOW);
    expect(Object.keys(await tasksOf(db, "e1")).sort()).toEqual([
      "advisor",
      "promo-eve",
      "promo-week",
      "proposal",
      "purchase",
    ]);
    client.close();
  });

  it("a changed lead time moves open tasks of every planned event", async () => {
    const { db, client } = await setup();
    await addEvent(db, "a", "2026-11-20");
    await addEvent(db, "b", "2026-12-11");
    await planFromForm(db, "a", { tags: ["funding"], recurring: false }, NOW);
    await planFromForm(db, "b", { tags: ["funding"], recurring: false }, NOW);
    await setTaskDone(db, (await tasksOf(db, "b")).funding.id, "u-aisha", true);

    await db.update(taskTemplates).set({ daysBefore: 28 }).where(eq(taskTemplates.id, "funding"));
    await syncAllPlans(db);
    expect((await tasksOf(db, "a")).funding.dueDate).toBe("2026-10-23");
    expect((await tasksOf(db, "b")).funding.dueDate).toBe("2026-11-20"); // done: unchanged
    client.close();
  });

  it("assigns only to current board members", async () => {
    const { db, client } = await setup();
    await addEvent(db, "e1", "2026-11-20");
    await planFromForm(db, "e1", { tags: [], draft: true, recurring: false }, NOW);
    const t = await tasksOf(db, "e1");
    expect(await assignTask(db, t["promo-week"].id, "u-visitor")).toEqual({ ok: false, error: "not_a_board_member" });
    expect((await assignTask(db, t["promo-week"].id, "u-omar")).ok).toBe(true);
    expect((await assignTask(db, t["promo-week"].id, null)).ok).toBe(true);
    expect(await assignTask(db, "nope", "u-omar")).toEqual({ ok: false, error: "not_found" });
    expect(await boardMembers(db)).toEqual([
      { userId: "u-aisha", name: "Aisha Karim" },
      { userId: "u-omar", name: "omar" },
    ]);
    client.close();
  });

  it("the overview lists upcoming planned events with their next task and overdue count", async () => {
    const { db, client } = await setup();
    await addEvent(db, "soon", "2026-10-27", { draft: true });
    await addEvent(db, "later", "2026-11-20");
    await addEvent(db, "unplanned", "2026-11-01");
    await addEvent(db, "cancelled", "2026-11-02", { cancelledAt: NOW });
    await planFromForm(db, "soon", { tags: ["room"], recurring: false }, NOW);
    await planFromForm(db, "later", { tags: ["food"], recurring: false }, NOW);
    await planFromForm(db, "cancelled", { tags: ["food"], recurring: false }, NOW);

    const rows = await getOverview(db, NOW);
    expect(rows.map((r) => r.id)).toEqual(["soon", "later"]);
    expect(rows[0]).toMatchObject({
      draft: true,
      overdue: 2,
      open: 3,
      next: { title: "Book a room", dueDate: "2026-10-13", state: "overdue" },
    });
    expect(rows[1]).toMatchObject({ draft: false, overdue: 0, next: { dueDate: "2026-11-13", state: "open" } });

    // After the event's day it drops off.
    expect((await getOverview(db, parseHMInLocal("2026-10-28", "09:00"))).map((r) => r.id)).toEqual(["later"]);
    client.close();
  });
});
