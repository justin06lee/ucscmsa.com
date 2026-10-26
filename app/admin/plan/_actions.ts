"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { events } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth";
import { assignTask as assignTaskDb, setTaskDone } from "./_plan";
import { fail, withSentence } from "@/lib/action-result";

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
  if (!id.success || typeof done !== "boolean") return fail("invalid");
  const r = await setTaskDone(db, id.data, session.user.id, done);
  if (!r.ok) return fail(r.error, r.error === "not_found" ? "That task no longer exists. Reload the page." : undefined);
  revalidatePlan(r.eventId);
  return r;
}

export async function assignTask(taskId: string, assigneeUserId: string) {
  await requireAdmin();
  const id = idSchema.safeParse(taskId);
  const who = z.string().max(64).safeParse(assigneeUserId);
  if (!id.success || !who.success) return fail("invalid");
  const r = await assignTaskDb(db, id.data, who.data || null);
  if (!r.ok) return r.error === "not_found" ? fail("not_found", "That task no longer exists. Reload the page.") : withSentence(r);
  revalidatePlan(r.eventId);
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
