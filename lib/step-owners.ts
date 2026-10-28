import { and, asc, eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { admins, notifyPrefs, timelineAssignees, timelines, users, type TimelineItem } from "@/lib/db/schema";

/** A person's name as the board sees it: their Google name, else their email's first part. */
export function displayName(u: { name: string | null; email: string }): string {
  return u.name?.trim() || u.email.split("@")[0];
}

/** Who does each step of a timeline: item id to user id. */
export async function stepOwners(db: DB, timelineId: string): Promise<Record<string, string>> {
  const rows = await db
    .select({ itemId: timelineAssignees.itemId, userId: timelineAssignees.userId })
    .from(timelineAssignees)
    .where(eq(timelineAssignees.timelineId, timelineId));
  return Object.fromEntries(rows.map((r) => [r.itemId, r.userId]));
}

export type AssignResult =
  | { ok: true; changed: boolean }
  | { ok: false; reason: "not_found" | "not_admin" };

/**
 * Give one step of the owner's timeline to a current admin, or to no one
 * (null). `changed` is false when that person already had it.
 */
export async function assignStep(
  db: DB,
  input: { timelineId: string; ownerUserId: string; itemId: string; assigneeUserId: string | null },
): Promise<AssignResult> {
  const [t] = await db
    .select({ items: timelines.items })
    .from(timelines)
    .where(and(eq(timelines.id, input.timelineId), eq(timelines.ownerUserId, input.ownerUserId)));
  if (!t || !t.items.some((i) => i.id === input.itemId)) return { ok: false, reason: "not_found" };
  const key = and(eq(timelineAssignees.timelineId, input.timelineId), eq(timelineAssignees.itemId, input.itemId));

  if (!input.assigneeUserId) {
    const gone = await db.delete(timelineAssignees).where(key).returning({ userId: timelineAssignees.userId });
    return { ok: true, changed: gone.length > 0 };
  }
  const [admin] = await db.select({ id: admins.id }).from(admins).where(eq(admins.userId, input.assigneeUserId)).limit(1);
  if (!admin) return { ok: false, reason: "not_admin" };
  const [current] = await db.select({ userId: timelineAssignees.userId }).from(timelineAssignees).where(key);
  if (current?.userId === input.assigneeUserId) return { ok: true, changed: false };
  await db
    .insert(timelineAssignees)
    .values({
      timelineId: input.timelineId,
      itemId: input.itemId,
      userId: input.assigneeUserId,
      assignedByUserId: input.ownerUserId,
    })
    .onConflictDoUpdate({
      target: [timelineAssignees.timelineId, timelineAssignees.itemId],
      set: { userId: input.assigneeUserId, assignedByUserId: input.ownerUserId, assignedAt: new Date() },
    });
  return { ok: true, changed: true };
}

export type MyStep = {
  timelineId: string;
  timelineTitle: string;
  eventDate: string;
  ownerName: string;
  item: TimelineItem;
};

/** Every step given to this person, across everyone's timelines, soonest first. */
export async function listMySteps(db: DB, userId: string): Promise<MyStep[]> {
  const rows = await db
    .select({
      itemId: timelineAssignees.itemId,
      timelineId: timelines.id,
      title: timelines.title,
      eventDate: timelines.eventDate,
      items: timelines.items,
      ownerName: users.name,
      ownerEmail: users.email,
    })
    .from(timelineAssignees)
    .innerJoin(timelines, eq(timelines.id, timelineAssignees.timelineId))
    .innerJoin(users, eq(users.id, timelines.ownerUserId))
    .where(eq(timelineAssignees.userId, userId))
    .orderBy(asc(timelines.eventDate));
  const steps: MyStep[] = [];
  for (const r of rows) {
    const item = r.items.find((i) => i.id === r.itemId);
    if (!item) continue;
    steps.push({
      timelineId: r.timelineId,
      timelineTitle: r.title,
      eventDate: r.eventDate,
      ownerName: displayName({ name: r.ownerName, email: r.ownerEmail }),
      item,
    });
  }
  return steps.sort((a, b) => (a.item.due === b.item.due ? 0 : a.item.due < b.item.due ? -1 : 1));
}

export async function isMuted(db: DB, userId: string): Promise<boolean> {
  const [row] = await db.select({ muted: notifyPrefs.muted }).from(notifyPrefs).where(eq(notifyPrefs.userId, userId));
  return row?.muted ?? false;
}

export async function setMuted(db: DB, userId: string, muted: boolean): Promise<void> {
  await db
    .insert(notifyPrefs)
    .values({ userId, muted })
    .onConflictDoUpdate({ target: notifyPrefs.userId, set: { muted, updatedAt: new Date() } });
}
