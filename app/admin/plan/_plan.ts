import { and, asc, eq, gte, inArray, isNull } from "drizzle-orm";
import { ulid } from "ulid";
import type { DB } from "@/lib/db/client";
import {
  admins,
  eventTags,
  eventTasks,
  eventPlanSelections,
  events,
  guides,
  taskTemplates,
  users,
} from "@/lib/db/schema";
import {
  isPlanTag,
  planSummary,
  reconcilePlan,
  taskState,
  includeDependencies,
  type PlanTag,
  type TaskState,
  type TaskTemplate,
} from "@/lib/planning";
import { buildTimeline } from "@/lib/playbook";
import { startOfLocalDayUtc, toLocalYmd } from "@/lib/time";

// Database half of event planning, taking the db (or a transaction) so it can
// be tested against a local database. The rules themselves are in
// lib/planning.ts.
//
// Which events have a plan: one-off events saved in the admin form that
// haven't happened yet get one (at least the promotion tasks). Imported and
// older events get one only once an admin tags them. An event "has a plan"
// when it has tasks.

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Exec = DB | Tx;

export async function loadTemplates(d: Exec): Promise<TaskTemplate[]> {
  const rows = await d.select().from(taskTemplates).where(isNull(taskTemplates.archivedAt)).orderBy(asc(taskTemplates.sort), asc(taskTemplates.id));
  return rows.map((r) => ({
    id: r.id,
    tag: r.tag,
    title: r.title,
    daysBefore: r.daysBefore,
    guideSlug: r.guideSlug,
    dependencies: r.dependencies,
  }));
}

export async function getEventTags(d: Exec, eventId: string): Promise<PlanTag[]> {
  const rows = await d.select({ tag: eventTags.tag }).from(eventTags).where(eq(eventTags.eventId, eventId));
  return rows.map((r) => r.tag).filter(isPlanTag);
}

export async function hasPlan(d: Exec, eventId: string): Promise<boolean> {
  const [row] = await d.select({ id: eventTasks.id }).from(eventTasks).where(eq(eventTasks.eventId, eventId)).limit(1);
  return row != null;
}

/**
 * Brings an event's tasks in line with its date, tags and the templates (see
 * reconcilePlan): adds missing tasks, re-dates open ones, removes open tasks
 * of tags that were taken off. Done tasks are never touched.
 */
export async function syncPlan(d: Exec, eventId: string, templates?: TaskTemplate[]) {
  const [ev] = await d.select({ startTime: events.startTime }).from(events).where(eq(events.id, eventId)).limit(1);
  if (!ev) return;
  // One at a time: d may be a transaction.
  const tags = await getEventTags(d, eventId);
  const tasks = await d.select().from(eventTasks).where(eq(eventTasks.eventId, eventId));
  const tpls = templates ?? (await loadTemplates(d));
  const [selection] = await d.select().from(eventPlanSelections).where(eq(eventPlanSelections.eventId, eventId));
  const selected = selection ? includeDependencies(selection.cardIds.filter((id) => tpls.some((t) => t.id === id)), tpls) : tpls;
  const changes = reconcilePlan({ eventYmd: toLocalYmd(ev.startTime), tags: selection ? [] : tags,
    templates: selection ? selected.map((t) => ({ ...t, tag: null })) : tpls, tasks });
  if (changes.remove.length) {
    await d
      .delete(eventTasks)
      .where(and(inArray(eventTasks.id, changes.remove), isNull(eventTasks.doneAt)));
  }
  for (const r of changes.redate) {
    await d
      .update(eventTasks)
      .set({ dueDate: r.dueDate, ...(r.title ? { title: r.title } : {}) })
      .where(and(eq(eventTasks.id, r.id), isNull(eventTasks.doneAt)));
  }
  if (changes.insert.length) {
    await d
      .insert(eventTasks)
      .values(changes.insert.map((t) => ({ id: ulid(), eventId, ...t })))
      .onConflictDoNothing();
  }
}

/**
 * Saves an event's tags and plans it, from the admin form. A plan is started
 * for a one-off event that hasn't happened yet; an event that already has one
 * keeps it in step whatever it becomes.
 */
export async function planFromForm(
  d: Exec,
  eventId: string,
  p: { tags: PlanTag[]; recurring: boolean; draft?: boolean },
  now: Date = new Date(),
) {
  const current = new Set(await getEventTags(d, eventId));
  const next = [...new Set(p.tags)];
  if (current.size !== next.length || next.some((t) => !current.has(t))) {
    await d.delete(eventTags).where(eq(eventTags.eventId, eventId));
    if (next.length) await d.insert(eventTags).values(next.map((tag) => ({ eventId, tag })));
  }
  if (await hasPlan(d, eventId)) return syncPlan(d, eventId);
  // Only an event the board is planning starts a checklist: a draft, or one
  // tagged with what it needs. Saving any other event leaves it unplanned.
  if (p.recurring || (!p.draft && next.length === 0)) return;
  const [ev] = await d.select({ startTime: events.startTime }).from(events).where(eq(events.id, eventId)).limit(1);
  if (!ev || toLocalYmd(ev.startTime) < toLocalYmd(now)) return;
  await syncPlan(d, eventId);
}

/** Re-dates open tasks everywhere after the lead-time defaults change. */
export async function syncAllPlans(d: Exec) {
  const templates = await loadTemplates(d);
  const rows = await d
    .selectDistinct({ eventId: eventTasks.eventId })
    .from(eventTasks)
    .where(isNull(eventTasks.doneAt));
  for (const r of rows) await syncPlan(d, r.eventId, templates);
}

export type BoardMember = { userId: string; name: string };

function displayName(u: { name: string | null; email: string }): string {
  return u.name?.trim() || u.email.split("@")[0];
}

/** Current admins, who tasks can be assigned to. */
export async function boardMembers(d: Exec): Promise<BoardMember[]> {
  const rows = await d
    .select({ userId: users.id, name: users.name, email: users.email })
    .from(admins)
    .innerJoin(users, eq(users.id, admins.userId));
  return rows
    .map((r) => ({ userId: r.userId, name: displayName(r) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function setTaskDone(d: Exec, taskId: string, userId: string, done: boolean) {
  const [task] = await d.select().from(eventTasks).where(eq(eventTasks.id, taskId)).limit(1);
  if (!task) return { ok: false as const, error: "not_found" };
  await d
    .update(eventTasks)
    .set(done ? { doneAt: new Date(), doneByUserId: userId } : { doneAt: null, doneByUserId: null })
    .where(eq(eventTasks.id, taskId));
  // An unticked task is open again, so it follows the event's date.
  if (!done) await syncPlan(d, task.eventId);
  return { ok: true as const, eventId: task.eventId };
}

export async function assignTask(d: Exec, taskId: string, assigneeUserId: string | null) {
  const [task] = await d.select().from(eventTasks).where(eq(eventTasks.id, taskId)).limit(1);
  if (!task) return { ok: false as const, error: "not_found" };
  if (assigneeUserId) {
    const [isAdmin] = await d.select({ id: admins.id }).from(admins).where(eq(admins.userId, assigneeUserId)).limit(1);
    if (!isAdmin) return { ok: false as const, error: "not_a_board_member" };
  }
  await d.update(eventTasks).set({ assigneeUserId }).where(eq(eventTasks.id, taskId));
  return { ok: true as const, eventId: task.eventId };
}

export type TimelineTask = {
  id: string;
  title: string;
  dueDate: string;
  state: TaskState;
  doneByName: string | null;
  assigneeUserId: string | null;
  guide: { slug: string; title: string } | null;
  cardId?: string | null;
  dependencies?: string[];
  warnings?: string[];
  prerequisites?: { title: string; done: boolean }[];
};

export async function getTimeline(d: Exec, eventId: string, now: Date = new Date()) {
  const [ev] = await d.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!ev) return null;
  const todayYmd = toLocalYmd(now);
  const [tags, rows, guideRows, people, templates] = await Promise.all([
    getEventTags(d, eventId),
    d
      .select({ task: eventTasks, guideSlug: taskTemplates.guideSlug })
      .from(eventTasks)
      .leftJoin(taskTemplates, eq(taskTemplates.id, eventTasks.templateId))
      .where(eq(eventTasks.eventId, eventId)),
    d.select({ slug: guides.slug, title: guides.title }).from(guides),
    d.select({ id: users.id, name: users.name, email: users.email }).from(users)
      .innerJoin(eventTasks, eq(eventTasks.doneByUserId, users.id))
      .where(eq(eventTasks.eventId, eventId)),
    loadTemplates(d),
  ]);
  const guideBySlug = new Map(guideRows.map((g) => [g.slug, g]));
  const nameById = new Map(people.map((u) => [u.id, displayName(u)]));
  const taskTemplateIds = new Set(rows.map((r) => r.task.templateId));
  const schedule = buildTimeline(toLocalYmd(ev.startTime), templates.filter((c) => taskTemplateIds.has(c.id)).map((c) => c.id), templates, todayYmd);
  const rank = new Map(schedule.map((t, i) => [t.cardId, i]));
  const scheduled = new Map(schedule.map((t) => [t.cardId, t]));
  const sorted = rows.map((r) => ({ ...r.task, guideSlug: r.guideSlug })).sort((a, b) => a.dueDate.localeCompare(b.dueDate) ||
    (rank.get(a.templateId ?? "") ?? 999) - (rank.get(b.templateId ?? "") ?? 999) || a.title.localeCompare(b.title));
  const tasks: TimelineTask[] = sorted.map((t) => ({
    id: t.id,
    cardId: templates.some((c) => c.id === t.templateId) ? t.templateId : null,
    warnings: t.templateId ? (scheduled.get(t.templateId)?.warnings ?? []) : [],
    title: t.title,
    prerequisites: (templates.find((c) => c.id === t.templateId)?.dependencies ?? []).flatMap((id) => {
      const dep = rows.find((r) => r.task.templateId === id)?.task;
      return dep ? [{ title: dep.title, done: dep.doneAt !== null }] : [];
    }),
    dueDate: t.dueDate,
    state: taskState(t, todayYmd),
    doneByName: t.doneByUserId ? (nameById.get(t.doneByUserId) ?? null) : null,
    assigneeUserId: t.assigneeUserId,
    guide: t.guideSlug ? (guideBySlug.get(t.guideSlug) ?? null) : null,
  }));
  return { event: ev, eventYmd: toLocalYmd(ev.startTime), todayYmd, tags, tasks };
}

export type OverviewRow = {
  id: string;
  title: string;
  eventYmd: string;
  draft: boolean;
  next: { title: string; dueDate: string; state: TaskState } | null;
  overdue: number;
  open: number;
  total: number;
};

/** Every planned event that hasn't happened yet, soonest first. */
export async function getOverview(d: Exec, now: Date = new Date()): Promise<OverviewRow[]> {
  const todayYmd = toLocalYmd(now);
  const rows = await d
    .select({ event: events, task: eventTasks })
    .from(eventTasks)
    .innerJoin(events, eq(events.id, eventTasks.eventId))
    .where(and(gte(events.startTime, startOfLocalDayUtc(todayYmd)), isNull(events.cancelledAt)))
    .orderBy(asc(events.startTime));
  const byEvent = new Map<string, { event: typeof events.$inferSelect; tasks: (typeof eventTasks.$inferSelect)[] }>();
  for (const r of rows) {
    const entry = byEvent.get(r.event.id) ?? { event: r.event, tasks: [] };
    entry.tasks.push(r.task);
    byEvent.set(r.event.id, entry);
  }
  return [...byEvent.values()].map(({ event, tasks }) => {
    const s = planSummary(tasks, todayYmd);
    return {
      id: event.id,
      title: event.title,
      eventYmd: toLocalYmd(event.startTime),
      draft: event.draft,
      next: s.next ? { title: s.next.title, dueDate: s.next.dueDate, state: taskState(s.next, todayYmd) } : null,
      overdue: s.overdue,
      open: s.open,
      total: s.total,
    };
  });
}
