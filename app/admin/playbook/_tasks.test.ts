import { describe, expect, it } from "vitest";
import { PLAN_TAG_IDS } from "@/lib/planning";
import { moveWithinTask, PLAYBOOK_TASKS, stepsFor, taskBySlug, taskForTag } from "./_tasks";

const cards = [
  { id: "a", tag: null },
  { id: "f", tag: "food" },
  { id: "b", tag: null },
  { id: "g", tag: "food" },
  { id: "c", tag: null },
] as const;

describe("playbook categories", () => {
  it("cover every planning tag and the untagged steps, once each", () => {
    expect(PLAYBOOK_TASKS.map((t) => t.tag).sort()).toEqual([...PLAN_TAG_IDS, null].sort());
    expect(new Set(PLAYBOOK_TASKS.map((t) => t.slug)).size).toBe(PLAYBOOK_TASKS.length);
  });

  it("find a category by slug or tag", () => {
    expect(taskBySlug("every")?.name).toBe("Hold an event");
    expect(taskBySlug("nope")).toBeUndefined();
    expect(taskForTag("food")?.name).toBe("Serve food");
  });

  it("list a category's steps in saved order", () => {
    expect(stepsFor(cards, taskBySlug("every")!).map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(stepsFor(cards, taskBySlug("room")!)).toEqual([]);
  });
});

describe("moveWithinTask", () => {
  const ids = (next: readonly { id: string }[] | null) => next?.map((c) => c.id);

  it("swaps a step with its neighbour in the same category, leaving others in place", () => {
    expect(ids(moveWithinTask(cards, "b", 1))).toEqual(["a", "f", "c", "g", "b"]);
    expect(ids(moveWithinTask(cards, "g", -1))).toEqual(["a", "g", "b", "f", "c"]);
  });

  it("refuses to move past either end of the category, or an unknown step", () => {
    expect(moveWithinTask(cards, "a", -1)).toBeNull();
    expect(moveWithinTask(cards, "c", 1)).toBeNull();
    expect(moveWithinTask(cards, "zzz", 1)).toBeNull();
  });
});
