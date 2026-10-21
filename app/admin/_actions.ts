"use server";

import { revalidatePath } from "next/cache";
import { ulid } from "ulid";
import { db } from "@/lib/db/client";
import { adminNominations, events } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAdminId } from "@/lib/auth";
import { eventInputSchema, nominateSchema, type EventInputForm } from "./_schemas";
import { parseHMInLocal, toLocalYmd } from "@/lib/time";
import { eventInstants } from "@/lib/event-rules";
import { approveNominationTx, createNomination } from "./_governance";
import { deleteEventRecordingImport } from "@/lib/import/apply";

function resolveDates(p: {
  startDate: string;
  endDate: string;
  recurrenceFreq: "none" | "daily" | "weekly" | "monthly" | "yearly";
}): { startDate: string; endDate: string } {
  if (p.recurrenceFreq === "none") {
    return { startDate: p.startDate, endDate: p.endDate };
  }
  const today = toLocalYmd(new Date());
  const startDate = p.startDate || today;
  const endDate = p.endDate || startDate;
  return { startDate, endDate };
}

// The timing and stored start/end for the form's dates and optional times.
function formInstants(p: EventInputForm) {
  const { startDate, endDate } = resolveDates(p);
  return eventInstants({
    date: startDate,
    endDate,
    startTime: p.startTime || undefined,
    endTime: p.endTime || undefined,
  });
}

// Everywhere an event shows up, including the landing page's upcoming list.
function revalidateEventPages(id?: string) {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/calendar");
  if (id) revalidatePath(`/calendar/events/${id}`);
}

function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k === "recurrenceByWeekday") continue;
    out[k] = v;
  }
  out.recurrenceByWeekday = fd.getAll("recurrenceByWeekday").join(",");
  return out;
}

export async function createEvent(fd: FormData) {
  const adminId = await requireAdminId();
  const parsed = eventInputSchema.safeParse(formToObject(fd));
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  const p = parsed.data;
  const id = ulid();
  await db.insert(events).values({
    id,
    title: p.title,
    description: p.description,
    location: p.location,
    ...formInstants(p),
    recurrenceFreq: p.recurrenceFreq === "none" ? null : p.recurrenceFreq,
    recurrenceByWeekday: p.recurrenceFreq === "weekly" ? p.recurrenceByWeekday : null,
    recurrenceInterval: p.recurrenceInterval,
    recurrenceUntil: p.recurrenceUntil ? parseHMInLocal(p.recurrenceUntil, "23:59") : null,
    createdByAdminId: adminId,
  });
  revalidateEventPages();
  return { ok: true as const, id };
}

// Trust model: any admin may edit/delete any event. The admin council is small
// and self-policing via the nomination flow, so per-event ownership would add
// friction without security benefit. Update this if that assumption changes.
export async function updateEvent(id: string, fd: FormData) {
  await requireAdminId();
  const parsed = eventInputSchema.safeParse(formToObject(fd));
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  const p = parsed.data;
  await db.update(events).set({
    title: p.title,
    description: p.description,
    location: p.location,
    ...formInstants(p),
    recurrenceFreq: p.recurrenceFreq === "none" ? null : p.recurrenceFreq,
    recurrenceByWeekday: p.recurrenceFreq === "weekly" ? p.recurrenceByWeekday : null,
    recurrenceInterval: p.recurrenceInterval,
    recurrenceUntil: p.recurrenceUntil ? parseHMInLocal(p.recurrenceUntil, "23:59") : null,
    updatedAt: new Date(),
    // Tells the event importer not to overwrite this admin's changes.
    adminEditedAt: new Date(),
  }).where(eq(events.id, id));
  revalidateEventPages(id);
  return { ok: true as const };
}

export async function deleteEvent(id: string) {
  await requireAdminId();
  // Imported events leave a tombstone so the importer doesn't re-create them.
  await deleteEventRecordingImport(db, id);
  revalidateEventPages(id);
  return { ok: true as const };
}

export async function nominateAdmin(fd: FormData) {
  const adminId = await requireAdminId();
  const parsed = nominateSchema.safeParse({
    action: fd.get("action"),
    nomineeEmail: fd.get("nomineeEmail") || undefined,
    targetAdminId: fd.get("targetAdminId") || undefined,
  });
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  const result = await createNomination(db, adminId, parsed.data);
  if (result.ok) revalidatePath("/admin/nominations");
  return result;
}

export async function approveNomination(nominationId: string) {
  const approverId = await requireAdminId();
  const result = await approveNominationTx(db, approverId, nominationId);
  if (result.ok && result.applied) {
    revalidatePath("/admin");
    revalidatePath("/admin/admins");
  }
  revalidatePath("/admin/nominations");
  return result;
}

export async function cancelNomination(nominationId: string) {
  const adminId = await requireAdminId();
  const result = await db.transaction(async (tx) => {
    const [nom] = await tx.select().from(adminNominations)
      .where(eq(adminNominations.id, nominationId)).limit(1);
    if (!nom) return { ok: false as const, error: "not_found" };
    if (nom.nominatedByAdminId !== adminId) {
      return { ok: false as const, error: "only_nominator_can_cancel" };
    }
    if (nom.status !== "pending") return { ok: false as const, error: "not_pending" };
    await tx.update(adminNominations)
      .set({ status: "cancelled" })
      .where(eq(adminNominations.id, nominationId));
    return { ok: true as const };
  });
  if (result.ok) revalidatePath("/admin/nominations");
  return result;
}
