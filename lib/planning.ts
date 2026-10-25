// Event planning: tags on an event generate a checklist of tasks whose due
// dates are worked backward from the event's date. Pure functions only; the
// database half is in app/admin/plan/_plan.ts.
//
// All dates here are Santa Cruz calendar days (YYYY-MM-DD). "21 days before"
// is calendar arithmetic on the day, so a DST change between the task and the
// event can't move a due date.

export const PLAN_TAGS = [
  { id: "room", label: "Room" },
  { id: "food", label: "Food" },
  { id: "funding", label: "Funding" },
  { id: "big", label: "Big event" },
  { id: "offcampus", label: "Off-campus" },
  { id: "collab", label: "Collab" },
] as const;

export type PlanTag = (typeof PLAN_TAGS)[number]["id"];
export const PLAN_TAG_IDS = PLAN_TAGS.map((t) => t.id) as [PlanTag, ...PlanTag[]];

export function isPlanTag(v: unknown): v is PlanTag {
  return typeof v === "string" && (PLAN_TAG_IDS as string[]).includes(v);
}

export function tagLabel(tag: string | null): string {
  if (tag == null) return "Every event";
  return PLAN_TAGS.find((t) => t.id === tag)?.label ?? tag;
}

/** Longest lead time a template may have. */
export const LEAD_DAYS_MAX = 120;

export type TaskTemplate = {
  id: string;
  tag: PlanTag | null; // null: every planned event gets it
  title: string;
  daysBefore: number;
  guideSlug: string | null;
  dependencies?: string[];
};

export type PlanTask = {
  id: string;
  templateId: string | null;
  tag: string | null;
  title: string;
  dueDate: string;
  doneAt: Date | null;
};

/** `ymd` moved by `days` calendar days (negative goes back). */
export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  // Date.UTC used purely as a calendar: no time zone is involved.
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** The day a task with this lead time is due for an event on `eventYmd`. */
export function dueDate(eventYmd: string, daysBefore: number): string {
  return addDaysYmd(eventYmd, -daysBefore);
}

/** Templates that apply to an event with these tags. */
export function templatesFor(tags: readonly string[], templates: readonly TaskTemplate[]) {
  return includeDependencies(templates.filter((t) => t.tag == null || tags.includes(t.tag)).map((t) => t.id), templates);
}

/** Prerequisite closure in topological order. Refuse cycles and missing cards. */
export function includeDependencies(ids: readonly string[], templates: readonly TaskTemplate[]): TaskTemplate[] {
  const byId = new Map(templates.map((t) => [t.id, t]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: TaskTemplate[] = [];
  function visit(id: string) {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error("Steps cannot depend on each other in a circle.");
    const t = byId.get(id);
    if (!t) throw new Error("A prerequisite no longer exists. Update the selection.");
    visiting.add(id);
    for (const dep of t.dependencies ?? []) visit(dep);
    visiting.delete(id);
    visited.add(id);
    ordered.push(t);
  }
  for (const id of ids) visit(id);
  return ordered;
}

/** A prerequisite may never be due after the step that needs it. */
export function scheduleTemplates(eventYmd: string, ordered: readonly TaskTemplate[]): Map<string, string> {
  const dates = new Map(ordered.map((t) => [t.id, dueDate(eventYmd, t.daysBefore)]));
  for (const t of [...ordered].reverse()) {
    for (const dep of t.dependencies ?? []) {
      if (dates.has(dep) && dates.get(dep)! > dates.get(t.id)!) dates.set(dep, dates.get(t.id)!);
    }
  }
  return dates;
}

export type PlanChanges = {
  insert: Array<{ templateId: string; tag: PlanTag | null; title: string; dueDate: string }>;
  redate: Array<{ id: string; dueDate: string; title?: string }>;
  remove: string[];
};

/**
 * What it takes to bring an event's tasks in line with its date, tags and the
 * current templates:
 *  - a template that applies and has no task yet gets one;
 *  - an open task re-derives its due date from the event date and its
 *    template's current lead time, so moving the event moves open tasks;
 *  - a done task never changes: not its date, not its title, and it is never
 *    removed, even when its tag is taken off the event;
 *  - an open task whose tag no longer applies is removed (nothing was done
 *    on it). Tasks with no template (the template was deleted) are left alone.
 */
export function reconcilePlan(p: {
  eventYmd: string;
  tags: readonly string[];
  templates: readonly TaskTemplate[];
  tasks: readonly PlanTask[];
}): PlanChanges {
  const applicable = templatesFor(p.tags, p.templates);
  const dates = scheduleTemplates(p.eventYmd, applicable);
  const byTemplate = new Map(p.tasks.filter((t) => t.templateId).map((t) => [t.templateId!, t]));
  const changes: PlanChanges = { insert: [], redate: [], remove: [] };

  for (const tpl of applicable) {
    const due = dates.get(tpl.id)!;
    const task = byTemplate.get(tpl.id);
    if (!task) {
      changes.insert.push({ templateId: tpl.id, tag: tpl.tag, title: tpl.title, dueDate: due });
    } else if (!task.doneAt && (task.dueDate !== due || task.title !== tpl.title)) {
      changes.redate.push({ id: task.id, dueDate: due, ...(task.title !== tpl.title ? { title: tpl.title } : {}) });
    }
  }

  const applicableIds = new Set(applicable.map((t) => t.id));
  for (const task of p.tasks) {
    if (task.doneAt || !task.templateId) continue;
    if (!applicableIds.has(task.templateId)) changes.remove.push(task.id);
  }
  return changes;
}

export type TaskState = "done" | "overdue" | "today" | "open";

export function taskState(task: { dueDate: string; doneAt: Date | null }, todayYmd: string): TaskState {
  if (task.doneAt) return "done";
  if (task.dueDate < todayYmd) return "overdue";
  if (task.dueDate === todayYmd) return "today";
  return "open";
}

/** Tasks in timeline order: by due date, then title, so the list is stable. */
export function sortTasks<T extends { dueDate: string; title: string }>(tasks: readonly T[]): T[] {
  return [...tasks].sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title),
  );
}

/**
 * Where the today marker goes: the index of the first task due after today
 * (tasks due today sit above the marker). Equal to tasks.length when every
 * task is due today or earlier.
 */
export function todayMarkerIndex(sorted: readonly { dueDate: string }[], todayYmd: string): number {
  const i = sorted.findIndex((t) => t.dueDate > todayYmd);
  return i === -1 ? sorted.length : i;
}

/** The next open task (earliest due) and how many open tasks are overdue. */
export function planSummary<T extends { dueDate: string; title: string; doneAt: Date | null }>(
  tasks: readonly T[],
  todayYmd: string,
): { next: T | null; overdue: number; open: number; total: number } {
  const open = sortTasks(tasks.filter((t) => !t.doneAt));
  return {
    next: open[0] ?? null,
    overdue: open.filter((t) => t.dueDate < todayYmd).length,
    open: open.length,
    total: tasks.length,
  };
}

/** Whole days from `fromYmd` to `toYmd` (negative when `toYmd` is earlier). */
export function daysBetween(fromYmd: string, toYmd: string): number {
  const ms = (ymd: string) => {
    const [y, m, d] = ymd.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(toYmd) - ms(fromYmd)) / 86_400_000);
}
