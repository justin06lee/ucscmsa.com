import { describe, expect, it } from "vitest";
import {
  addDaysYmd,
  dueDate,
  planSummary,
  reconcilePlan,
  sortTasks,
  taskState,
  todayMarkerIndex,
  type PlanTask,
  type TaskTemplate,
} from "./planning";
import { parseHMInLocal, toLocalYmd } from "./time";

const TEMPLATES: TaskTemplate[] = [
  { id: "funding", tag: "funding", title: "Apply for funding", daysBefore: 21, guideSlug: "funding" },
  { id: "proposal", tag: "big", title: "Send the event proposal", daysBefore: 21, guideSlug: "bigger-events" },
  { id: "advisor", tag: "big", title: "Meet with the advisor", daysBefore: 14, guideSlug: "bigger-events" },
  { id: "room", tag: "room", title: "Book a room", daysBefore: 14, guideSlug: "book-a-room" },
  { id: "purchase", tag: "food", title: "Submit the purchase form", daysBefore: 7, guideSlug: "food" },
  { id: "promo-week", tag: null, title: "Post on Instagram and WhatsApp", daysBefore: 7, guideSlug: "promotion" },
  { id: "promo-eve", tag: null, title: "Post a reminder", daysBefore: 1, guideSlug: "promotion" },
];

/** Applies reconcilePlan's changes to a task list, like the database half does. */
function apply(tasks: PlanTask[], changes: ReturnType<typeof reconcilePlan>): PlanTask[] {
  const out = tasks
    .filter((t) => !changes.remove.includes(t.id))
    .map((t) => {
      const r = changes.redate.find((x) => x.id === t.id);
      return r ? { ...t, dueDate: r.dueDate } : t;
    });
  for (const ins of changes.insert) {
    out.push({ id: `t-${ins.templateId}`, doneAt: null, ...ins });
  }
  return out;
}

function plan(eventYmd: string, tags: string[], tasks: PlanTask[] = [], templates = TEMPLATES) {
  return apply(tasks, reconcilePlan({ eventYmd, tags, templates, tasks }));
}

const due = (tasks: PlanTask[]) =>
  Object.fromEntries(sortTasks(tasks).map((t) => [t.templateId, t.dueDate]));

describe("backward due dates", () => {
  it("works back calendar days across month and year ends", () => {
    expect(dueDate("2026-11-12", 21)).toBe("2026-10-22");
    expect(dueDate("2027-01-05", 7)).toBe("2026-12-29");
    expect(dueDate("2028-03-01", 1)).toBe("2028-02-29"); // leap year
    expect(addDaysYmd("2026-10-21", 0)).toBe("2026-10-21");
  });

  it("is not moved by DST: both changes fall between task and event", () => {
    // DST ends Sun 2026-11-01; an event the next day, three weeks of lead time.
    expect(dueDate("2026-11-02", 21)).toBe("2026-10-12");
    // DST starts Sun 2027-03-14.
    expect(dueDate("2027-03-15", 7)).toBe("2027-03-08");
    expect(dueDate("2027-03-14", 1)).toBe("2027-03-13");
  });

  it("uses the Santa Cruz day of the event, not the UTC day", () => {
    // 9 PM PDT on Oct 30 is already Oct 31 in UTC.
    const start = parseHMInLocal("2026-10-30", "21:00");
    expect(start.toISOString().slice(0, 10)).toBe("2026-10-31");
    const ymd = toLocalYmd(start);
    expect(ymd).toBe("2026-10-30");
    expect(dueDate(ymd, 1)).toBe("2026-10-29");
  });

  it("generates the tag tasks plus the promotion tasks every event gets", () => {
    const tasks = plan("2026-11-20", ["room", "food", "funding", "big"]);
    expect(due(tasks)).toEqual({
      funding: "2026-10-30",
      proposal: "2026-10-30",
      advisor: "2026-11-06",
      room: "2026-11-06",
      purchase: "2026-11-13",
      "promo-week": "2026-11-13",
      "promo-eve": "2026-11-19",
    });
    expect(plan("2026-11-20", []).map((t) => t.templateId).sort()).toEqual(["promo-eve", "promo-week"]);
  });

  it("an event that's too soon starts with its tasks already overdue", () => {
    const today = "2026-10-21";
    const tasks = plan("2026-10-27", ["funding", "room"]);
    const states = Object.fromEntries(tasks.map((t) => [t.templateId, taskState(t, today)]));
    expect(states).toEqual({
      funding: "overdue", // due 10-06
      room: "overdue", // due 10-13
      "promo-week": "overdue", // due 10-20
      "promo-eve": "open", // due 10-26
    });
    expect(planSummary(tasks, today)).toMatchObject({ overdue: 3, open: 4, total: 4 });
    expect(planSummary(tasks, today).next?.templateId).toBe("funding");
    // A task due today is due, not overdue.
    expect(taskState({ dueDate: today, doneAt: null }, today)).toBe("today");
    expect(taskState({ dueDate: "2026-10-01", doneAt: new Date() }, today)).toBe("done");
  });
});

describe("when the event date moves", () => {
  it("re-derives open tasks and leaves done ones as they were", () => {
    let tasks = plan("2026-11-20", ["room", "food"]);
    tasks = tasks.map((t) =>
      t.templateId === "room" ? { ...t, doneAt: new Date("2026-11-01T18:00:00Z") } : t,
    );
    // The event moves a week later.
    const moved = plan("2026-11-27", ["room", "food"], tasks);
    expect(due(moved)).toEqual({
      room: "2026-11-06", // done: unchanged
      purchase: "2026-11-20",
      "promo-week": "2026-11-20",
      "promo-eve": "2026-11-26",
    });
    expect(moved.find((t) => t.templateId === "room")?.doneAt).not.toBeNull();
    expect(moved).toHaveLength(tasks.length);
  });

  it("does nothing when nothing changed", () => {
    const tasks = plan("2026-11-20", ["room"]);
    expect(reconcilePlan({ eventYmd: "2026-11-20", tags: ["room"], templates: TEMPLATES, tasks })).toEqual({
      insert: [],
      redate: [],
      remove: [],
    });
  });

  it("follows a changed lead-time default for open tasks only", () => {
    let tasks = plan("2026-11-20", ["funding", "room"]);
    tasks = tasks.map((t) => (t.templateId === "room" ? { ...t, doneAt: new Date() } : t));
    const templates = TEMPLATES.map((t) =>
      t.id === "funding" ? { ...t, daysBefore: 28 } : t.id === "room" ? { ...t, daysBefore: 21 } : t,
    );
    const after = plan("2026-11-20", ["funding", "room"], tasks, templates);
    expect(due(after).funding).toBe("2026-10-23");
    expect(due(after).room).toBe("2026-11-06"); // done, so it keeps its date
  });
});

describe("when tags change", () => {
  it("adds the new tag's tasks", () => {
    const tasks = plan("2026-11-20", ["room"]);
    const after = plan("2026-11-20", ["room", "big"], tasks);
    expect(after.map((t) => t.templateId).sort()).toEqual([
      "advisor",
      "promo-eve",
      "promo-week",
      "proposal",
      "room",
    ]);
  });

  it("removes a dropped tag's open tasks but never a done one", () => {
    let tasks = plan("2026-11-20", ["big", "food"]);
    tasks = tasks.map((t) => (t.templateId === "proposal" ? { ...t, doneAt: new Date() } : t));
    const after = plan("2026-11-20", ["food"], tasks);
    const ids = after.map((t) => t.templateId).sort();
    expect(ids).toEqual(["promo-eve", "promo-week", "proposal", "purchase"]);
    expect(after.find((t) => t.templateId === "proposal")?.doneAt).not.toBeNull();

    // Putting the tag back brings back only what's missing: no duplicate.
    const again = plan("2026-11-20", ["food", "big"], after);
    expect(again.filter((t) => t.templateId === "proposal")).toHaveLength(1);
    expect(again.map((t) => t.templateId).sort()).toEqual([
      "advisor",
      "promo-eve",
      "promo-week",
      "proposal",
      "purchase",
    ]);
  });

  it("leaves tasks whose template is gone alone", () => {
    const orphan: PlanTask = { id: "x", templateId: null, tag: "room", title: "Old", dueDate: "2026-11-01", doneAt: null };
    const changes = reconcilePlan({ eventYmd: "2026-11-20", tags: [], templates: TEMPLATES, tasks: [orphan] });
    expect(changes.remove).toEqual([]);
  });
});

describe("timeline", () => {
  it("puts the today marker after tasks due today and before later ones", () => {
    const sorted = [{ dueDate: "2026-10-10" }, { dueDate: "2026-10-21" }, { dueDate: "2026-10-22" }];
    expect(todayMarkerIndex(sorted, "2026-10-21")).toBe(2);
    expect(todayMarkerIndex(sorted, "2026-10-01")).toBe(0);
    expect(todayMarkerIndex(sorted, "2026-12-01")).toBe(3);
  });
});
