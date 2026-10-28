import { and, eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { admins, notifyPrefs, reminderSends, timelineAssignees, timelines, users } from "@/lib/db/schema";
import { emailConfigFromEnv, sendEmail, type OutgoingEmail, type SendResult } from "@/lib/email";
import { muteLinks } from "@/lib/mute-token";
import { assignmentEmail, dailyEmail, type DueStep } from "@/lib/step-emails";
import { SITE_URL } from "@/lib/site";
import { displayName } from "@/lib/step-owners";

export type MailContext = {
  siteUrl: string;
  /** Signs the mute links (AUTH_SECRET). */
  secret: string;
  send: (email: OutgoingEmail) => Promise<SendResult>;
};

/**
 * The 8 AM email: each current admin with steps overdue, due today or due in
 * the next 3 days gets one email, unless they muted them. A person is emailed
 * at most once per `today`, however often this runs.
 */
export async function runDailyReminders(db: DB, today: string, ctx: MailContext) {
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      muted: notifyPrefs.muted,
      itemId: timelineAssignees.itemId,
      timelineTitle: timelines.title,
      items: timelines.items,
    })
    .from(timelineAssignees)
    .innerJoin(timelines, eq(timelines.id, timelineAssignees.timelineId))
    .innerJoin(users, eq(users.id, timelineAssignees.userId))
    .innerJoin(admins, eq(admins.userId, users.id))
    .leftJoin(notifyPrefs, eq(notifyPrefs.userId, users.id));

  const people = new Map<string, { name: string; email: string; steps: DueStep[] }>();
  for (const r of rows) {
    if (r.muted) continue;
    const item = r.items.find((i) => i.id === r.itemId);
    if (!item) continue;
    const p = people.get(r.userId) ?? { name: displayName(r), email: r.email, steps: [] };
    p.steps.push({ title: item.title, timelineTitle: r.timelineTitle, due: item.due, done: item.done });
    people.set(r.userId, p);
  }

  const result = { sent: 0, already: 0, failed: 0 };
  const stepsUrl = `${ctx.siteUrl}/admin/steps`;
  for (const [userId, p] of people) {
    const links = muteLinks(ctx.siteUrl, userId, ctx.secret);
    const mail = dailyEmail({ toName: p.name, today, steps: p.steps, stepsUrl, muteUrl: links.page });
    if (!mail) continue;
    // Claim the day first, so a second run at the same time can't send it again.
    const claimed = await db
      .insert(reminderSends)
      .values({ userId, day: today })
      .onConflictDoNothing()
      .returning({ userId: reminderSends.userId });
    if (!claimed.length) {
      result.already++;
      continue;
    }
    const res = await ctx.send({
      to: p.email,
      ...mail,
      oneClickUrl: links.oneClick,
      idempotencyKey: `daily:${userId}:${today}`,
    });
    if (res.sent) {
      result.sent++;
    } else {
      // Not sent, so let a later run try again today.
      await db.delete(reminderSends).where(and(eq(reminderSends.userId, userId), eq(reminderSends.day, today)));
      result.failed++;
    }
  }
  return result;
}

/** The email that goes out when a step is given to someone. Nothing when they gave it to themselves or muted emails. */
export async function sendAssignmentEmail(
  db: DB,
  input: { timelineId: string; itemId: string; assigneeUserId: string; byUserId: string },
  ctx: MailContext,
): Promise<SendResult | null> {
  if (input.assigneeUserId === input.byUserId) return null;
  const [to] = await db
    .select({ name: users.name, email: users.email, muted: notifyPrefs.muted })
    .from(users)
    .leftJoin(notifyPrefs, eq(notifyPrefs.userId, users.id))
    .where(eq(users.id, input.assigneeUserId));
  const [by] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, input.byUserId));
  const [t] = await db
    .select({ title: timelines.title, eventDate: timelines.eventDate, items: timelines.items })
    .from(timelines)
    .where(eq(timelines.id, input.timelineId));
  const item = t?.items.find((i) => i.id === input.itemId);
  if (!to || to.muted || !by || !t || !item) return null;

  const links = muteLinks(ctx.siteUrl, input.assigneeUserId, ctx.secret);
  const mail = assignmentEmail({
    toName: displayName(to),
    byName: displayName(by),
    step: { title: item.title, timelineTitle: t.title, due: item.due, done: item.done },
    eventDate: t.eventDate,
    stepsUrl: `${ctx.siteUrl}/admin/steps`,
    muteUrl: links.page,
  });
  return ctx.send({
    to: to.email,
    ...mail,
    oneClickUrl: links.oneClick,
    idempotencyKey: `assign:${input.timelineId}:${input.itemId}:${input.assigneeUserId}`,
  });
}

/** Real sending, when Resend is set up (RESEND_API_KEY) and mute links can be signed (AUTH_SECRET). */
export function mailContextFromEnv(): MailContext | null {
  const config = emailConfigFromEnv();
  const secret = process.env.AUTH_SECRET;
  if (!config || !secret) return null;
  return { siteUrl: SITE_URL, secret, send: (email) => sendEmail(email, config) };
}
