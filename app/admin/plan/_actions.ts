"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { events, taskTemplates } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth";
import { LEAD_DAYS_MAX } from "@/lib/planning";
import { title as eventTitle } from "@/lib/event-rules";
import { assignTask as assignTaskDb, setTaskDone, syncAllPlans } from "./_plan";

// Every action checks for an admin itself: server actions are reachable by a
// direct POST, whatever the page around them checked.

const idSchema = z.string().min(1).max(64);

function revalidatePlan(eventId?: string) {
  revalidatePath("/admin/plan");
  if (eventId) revalidatePath(`/admin/plan/${eventId}`);
}

export async function toggleTask(taskId: string, done: boolean) {
  const session = await requireAdmin();
  const id = idSchema.safeParse(taskId);
  if (!id.success || typeof done !== "boolean") return { ok: false as const, error: "invalid" };
  const r = await setTaskDone(db, id.data, session.user.id, done);
  if (r.ok) revalidatePlan(r.eventId);
  return r;
}

export async function assignTask(taskId: string, assigneeUserId: string) {
  await requireAdmin();
  const id = idSchema.safeParse(taskId);
  const who = z.string().max(64).safeParse(assigneeUserId);
  if (!id.success || !who.success) return { ok: false as const, error: "invalid" };
  const r = await assignTaskDb(db, id.data, who.data || null);
  if (r.ok) revalidatePlan(r.eventId);
  return r;
}

export async function publishEvent(eventId: string) {
  await requireAdmin();
  const id = idSchema.safeParse(eventId);
  if (!id.success) return { ok: false as const, error: "invalid" };
  const [row] = await db
    .update(events)
    .set({ draft: false, updatedAt: new Date() })
    .where(eq(events.id, id.data))
    .returning({ id: events.id });
  if (!row) return { ok: false as const, error: "not_found" };
  // Everywhere the event now shows up.
  revalidatePath("/");
  revalidatePath("/calendar");
  revalidatePath(`/calendar/events/${row.id}`, "layout");
  revalidatePath("/sitemap.xml");
  revalidatePath("/admin");
  revalidatePlan(row.id);
  return { ok: true as const };
}

const leadTimeSchema = z.object({
  id: idSchema,
  title: eventTitle,
  daysBefore: z.coerce
    .number({ message: "Days before must be a number" })
    .int("Days before must be a whole number")
    .min(0, "Days before can't be negative")
    .max(LEAD_DAYS_MAX, `Days before can be at most ${LEAD_DAYS_MAX}`),
});

/** Saves the lead-time defaults; open tasks everywhere follow them. */
export async function saveLeadTimes(fd: FormData) {
  await requireAdmin();
  const ids = fd.getAll("id").map(String);
  const rows = ids.map((id) => ({
    id,
    title: fd.get(`title:${id}`),
    daysBefore: fd.get(`days:${id}`),
  }));
  const parsed = z.array(leadTimeSchema).min(1).max(100).safeParse(rows);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "invalid" };
  await db.transaction(async (tx) => {
    const known = new Set(
      (await tx.select({ id: taskTemplates.id }).from(taskTemplates).where(inArray(taskTemplates.id, ids))).map(
        (r) => r.id,
      ),
    );
    for (const r of parsed.data) {
      if (!known.has(r.id)) continue;
      await tx
        .update(taskTemplates)
        .set({ title: r.title, daysBefore: r.daysBefore })
        .where(eq(taskTemplates.id, r.id));
    }
    await syncAllPlans(tx);
  });
  revalidatePath("/admin/plan", "layout");
  return { ok: true as const };
}
