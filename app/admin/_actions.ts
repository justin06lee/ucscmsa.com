"use server";

import { revalidatePath } from "next/cache";
import { ulid } from "ulid";
import { db } from "@/lib/db/client";
import { admins, adminApprovals, adminNominations, events } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { requireAdminId } from "@/lib/auth";
import { eventInputSchema, nominateSchema } from "./_schemas";
import { parseHMInLocal } from "@/lib/time";

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
  const startTime = parseHMInLocal(p.startDate, p.startTime);
  const endTime = parseHMInLocal(p.endDate, p.endTime);
  const id = ulid();
  await db.insert(events).values({
    id,
    title: p.title,
    description: p.description,
    location: p.location,
    startTime,
    endTime,
    recurrenceFreq: p.recurrenceFreq === "none" ? null : p.recurrenceFreq,
    recurrenceByWeekday: p.recurrenceFreq === "weekly" ? p.recurrenceByWeekday : null,
    recurrenceInterval: p.recurrenceInterval,
    recurrenceUntil: p.recurrenceUntil ? parseHMInLocal(p.recurrenceUntil, "23:59") : null,
    createdByAdminId: adminId,
  });
  revalidatePath("/admin");
  revalidatePath("/calendar");
  return { ok: true as const, id };
}

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
    startTime: parseHMInLocal(p.startDate, p.startTime),
    endTime: parseHMInLocal(p.endDate, p.endTime),
    recurrenceFreq: p.recurrenceFreq === "none" ? null : p.recurrenceFreq,
    recurrenceByWeekday: p.recurrenceFreq === "weekly" ? p.recurrenceByWeekday : null,
    recurrenceInterval: p.recurrenceInterval,
    recurrenceUntil: p.recurrenceUntil ? parseHMInLocal(p.recurrenceUntil, "23:59") : null,
    updatedAt: new Date(),
  }).where(eq(events.id, id));
  revalidatePath("/admin");
  revalidatePath(`/calendar/events/${id}`);
  revalidatePath("/calendar");
  return { ok: true as const };
}

export async function deleteEvent(id: string) {
  await requireAdminId();
  await db.delete(events).where(eq(events.id, id));
  revalidatePath("/admin");
  revalidatePath("/calendar");
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
  const { action, nomineeEmail, targetAdminId } = parsed.data;

  if (action === "promote") {
    if (!nomineeEmail) return { ok: false as const, error: "email required" };
  } else {
    if (!targetAdminId) return { ok: false as const, error: "target admin required" };
    const [{ total }] = await db.select({ total: count() }).from(admins);
    if (total <= 1) {
      return { ok: false as const, error: "cannot demote the last admin" };
    }
  }

  const id = ulid();
  await db.insert(adminNominations).values({
    id,
    action,
    nomineeEmail: action === "promote" ? nomineeEmail! : null,
    targetAdminId: action === "demote" ? targetAdminId! : null,
    nominatedByAdminId: adminId,
  });
  revalidatePath("/admin/nominations");
  return { ok: true as const, id };
}

export async function approveNomination(nominationId: string) {
  const approverId = await requireAdminId();

  try {
    return await db.transaction(async (tx) => {
      const [nom] = await tx.select().from(adminNominations)
        .where(eq(adminNominations.id, nominationId)).limit(1);
      if (!nom) return { ok: false as const, error: "not_found" };
      if (nom.status !== "pending") return { ok: false as const, error: "not_pending" };
      if (nom.nominatedByAdminId === approverId) {
        return { ok: false as const, error: "nominator_cannot_approve" };
      }

      try {
        await tx.insert(adminApprovals).values({
          nominationId,
          approverAdminId: approverId,
        });
      } catch {
        return { ok: false as const, error: "already_approved" };
      }

      const approvals = await tx.select().from(adminApprovals)
        .where(eq(adminApprovals.nominationId, nominationId));
      const approverIds = approvals.map((a) => a.approverAdminId);
      const distinctFromNominator = approverIds.filter(
        (id) => id !== nom.nominatedByAdminId
      );

      if (distinctFromNominator.length < 2) {
        return { ok: true as const, applied: false };
      }

      if (nom.action === "promote") {
        if (!nom.nomineeEmail) throw new Error("promote nomination missing email");
        const { users } = await import("@/lib/db/schema");
        const [u] = await tx.select().from(users)
          .where(eq(users.email, nom.nomineeEmail)).limit(1);
        if (!u) {
          return { ok: false as const, error: "nominee_must_sign_in_first" };
        }
        await tx.insert(admins)
          .values({ userId: u.id, promotedByNominationId: nominationId })
          .onConflictDoNothing();
      } else {
        if (!nom.targetAdminId) throw new Error("demote nomination missing target");
        const [{ total }] = await tx.select({ total: count() }).from(admins);
        if (total <= 1) {
          return { ok: false as const, error: "would_remove_last_admin" };
        }
        await tx.delete(admins).where(eq(admins.id, nom.targetAdminId));
        const [{ total: afterDelete }] = await tx.select({ total: count() }).from(admins);
        if (afterDelete === 0) {
          throw new Error("last_admin_race");
        }
      }

      await tx.update(adminNominations)
        .set({ status: "approved" })
        .where(eq(adminNominations.id, nominationId));

      revalidatePath("/admin");
      revalidatePath("/admin/admins");
      revalidatePath("/admin/nominations");
      return { ok: true as const, applied: true };
    });
  } catch (err) {
    if (err instanceof Error && err.message === "last_admin_race") {
      return { ok: false as const, error: "would_remove_last_admin" };
    }
    throw err;
  }
}

export async function cancelNomination(nominationId: string) {
  const adminId = await requireAdminId();
  const [nom] = await db.select().from(adminNominations)
    .where(eq(adminNominations.id, nominationId)).limit(1);
  if (!nom) return { ok: false as const, error: "not_found" };
  if (nom.nominatedByAdminId !== adminId) {
    return { ok: false as const, error: "only_nominator_can_cancel" };
  }
  if (nom.status !== "pending") return { ok: false as const, error: "not_pending" };
  await db.update(adminNominations)
    .set({ status: "cancelled" })
    .where(eq(adminNominations.id, nominationId));
  revalidatePath("/admin/nominations");
  return { ok: true as const };
}
