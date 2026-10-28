import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { setupBoard } from "@/test/board";
import { timelines } from "@/lib/db/schema";
import { deleteTimeline, setItemDone } from "@/lib/playbook-db";
import { assignStep, isMuted, listMySteps, setMuted, stepOwners } from "@/lib/step-owners";

let open: { client: { close(): void } } | null = null;
afterEach(() => {
  open?.client.close();
  open = null;
});

async function board() {
  const t = await setupBoard();
  open = t;
  return t;
}

describe("assignStep", () => {
  it("gives a step to a board member, changes hands, and clears", async () => {
    const { db, tl } = await board();
    const base = { timelineId: tl.id, ownerUserId: "u-aisha", itemId: "b" };
    expect(await assignStep(db, { ...base, assigneeUserId: "u-omar" })).toEqual({ ok: true, changed: true });
    expect(await assignStep(db, { ...base, assigneeUserId: "u-omar" })).toEqual({ ok: true, changed: false });
    expect(await stepOwners(db, tl.id)).toEqual({ b: "u-omar" });
    expect(await assignStep(db, { ...base, assigneeUserId: "u-aisha" })).toEqual({ ok: true, changed: true });
    expect(await stepOwners(db, tl.id)).toEqual({ b: "u-aisha" });
    expect(await assignStep(db, { ...base, assigneeUserId: null })).toEqual({ ok: true, changed: true });
    expect(await stepOwners(db, tl.id)).toEqual({});
  });

  it("refuses non-admins, other people's timelines and unknown steps", async () => {
    const { db, tl } = await board();
    const base = { timelineId: tl.id, ownerUserId: "u-aisha", itemId: "b" };
    expect(await assignStep(db, { ...base, assigneeUserId: "u-yusuf" })).toEqual({ ok: false, reason: "not_admin" });
    expect(await assignStep(db, { ...base, ownerUserId: "u-omar", assigneeUserId: "u-omar" })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await assignStep(db, { ...base, itemId: "zzz", assigneeUserId: "u-omar" })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await stepOwners(db, tl.id)).toEqual({});
  });

  it("goes away with the timeline", async () => {
    const { db, tl } = await board();
    await assignStep(db, { timelineId: tl.id, ownerUserId: "u-aisha", itemId: "b", assigneeUserId: "u-omar" });
    await deleteTimeline(db, tl.id, "u-aisha");
    expect(await listMySteps(db, "u-omar")).toEqual([]);
  });
});

describe("listMySteps", () => {
  it("lists the person's steps with their timeline, soonest first", async () => {
    const { db, tl } = await board();
    for (const itemId of ["b", "a"]) {
      await assignStep(db, { timelineId: tl.id, ownerUserId: "u-aisha", itemId, assigneeUserId: "u-omar" });
    }
    const mine = await listMySteps(db, "u-omar");
    expect(mine.map((s) => s.item.title)).toEqual(["File the Event Proposal", "Get a food permit"]);
    expect(mine[0]).toMatchObject({ timelineId: tl.id, timelineTitle: "Bake Sale", eventDate: "2026-12-03", ownerName: "Aisha Karim" });
    expect(await listMySteps(db, "u-aisha")).toEqual([]);
  });
});

describe("setItemDone", () => {
  it("lets the owner tick any step and a member only their own", async () => {
    const { db, tl } = await board();
    await assignStep(db, { timelineId: tl.id, ownerUserId: "u-aisha", itemId: "b", assigneeUserId: "u-omar" });
    expect(await setItemDone(db, tl.id, "u-omar", "a", true)).toBe(false);
    expect(await setItemDone(db, tl.id, "u-yusuf", "b", true)).toBe(false);
    expect(await setItemDone(db, tl.id, "u-omar", "b", true)).toBe(true);
    expect(await setItemDone(db, tl.id, "u-aisha", "a", true)).toBe(true);
    const [row] = await db.select({ items: timelines.items }).from(timelines).where(eq(timelines.id, tl.id));
    expect(row.items.map((i) => [i.id, i.done])).toEqual([
      ["a", true],
      ["b", true],
    ]);
    expect(await setItemDone(db, tl.id, "u-omar", "b", false)).toBe(true);
    const [after] = await db.select({ items: timelines.items }).from(timelines).where(eq(timelines.id, tl.id));
    expect(after.items.find((i) => i.id === "b")?.done).toBe(false);
    expect(after.items.find((i) => i.id === "a")?.done).toBe(true);
  });

  it("writes one step only, so ticks from two people at once both stay", async () => {
    const { db, tl } = await board();
    await assignStep(db, { timelineId: tl.id, ownerUserId: "u-aisha", itemId: "b", assigneeUserId: "u-omar" });
    await Promise.all([setItemDone(db, tl.id, "u-aisha", "a", true), setItemDone(db, tl.id, "u-omar", "b", true)]);
    const [row] = await db.select({ items: timelines.items }).from(timelines).where(eq(timelines.id, tl.id));
    expect(row.items.every((i) => i.done)).toBe(true);
  });
});

describe("mute", () => {
  it("is off until set, and can be turned back on", async () => {
    const { db } = await board();
    expect(await isMuted(db, "u-omar")).toBe(false);
    await setMuted(db, "u-omar", true);
    expect(await isMuted(db, "u-omar")).toBe(true);
    await setMuted(db, "u-omar", false);
    expect(await isMuted(db, "u-omar")).toBe(false);
  });
});
