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
import { z } from "zod";
import { imageAlt, imageId } from "@/lib/event-rules";
import { EVENT_IMAGES_MAX, type EventImage } from "@/lib/event-image";
import {
  cleanUp,
  deleteEventImageFiles,
  eventImagesPrefix,
  ImageRejectedError,
  processEventImage,
  storeEventImage,
} from "@/lib/event-image-store";
import { getStorage } from "@/lib/storage";
import { isPlanTag } from "@/lib/planning";
import { hasPlan, planFromForm, syncPlan } from "./plan/_plan";

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

// Everywhere an event shows up, including the landing page's upcoming list,
// the sitemap and the board's planning pages. "layout" takes the event page's
// share image with it, so one that went back to draft stops showing there too.
function revalidateEventPages(id?: string) {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/calendar");
  revalidatePath("/sitemap.xml");
  revalidatePath("/admin/plan");
  if (id) {
    revalidatePath(`/calendar/events/${id}`, "layout");
    revalidatePath(`/admin/plan/${id}`);
  }
}

// The form's planning fields: whether the event is a draft, and its tags. Only
// a form that carries them (planning=1) changes them, so an edit from an older
// copy of the form can't publish a draft or drop its tags.
function planningFields(fd: FormData) {
  if (fd.get("planning") !== "1") return null;
  return {
    draft: fd.get("draft") === "on",
    tags: fd.getAll("tags").filter(isPlanTag),
  };
}

// Links come as rows of linkKind/linkLabel/linkUrl fields, paired by
// position; rows with a blank URL and label are dropped, and a blank kind is
// "other". No linkUrl fields at all means the form doesn't edit links.
function formLinks(fd: FormData): { kind: string; label: string; url: string }[] | undefined {
  if (!fd.has("linkUrl")) return undefined;
  const kinds = fd.getAll("linkKind").map(String);
  const labels = fd.getAll("linkLabel").map(String);
  const urls = fd.getAll("linkUrl").map(String);
  return urls
    .map((url, i) => ({ kind: kinds[i] || "other", label: labels[i] ?? "", url }))
    .filter((l) => l.label.trim() || l.url.trim());
}

function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k === "recurrenceByWeekday" || k.startsWith("link")) continue;
    out[k] = v;
  }
  out.recurrenceByWeekday = fd.getAll("recurrenceByWeekday").join(",");
  out.links = formLinks(fd);
  return out;
}

export async function createEvent(fd: FormData) {
  const adminId = await requireAdminId();
  const parsed = eventInputSchema.safeParse(formToObject(fd));
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "invalid" };
  }
  const p = parsed.data;
  const planning = planningFields(fd);
  const id = ulid();
  // The event and its checklist land together or not at all.
  await db.transaction(async (tx) => {
    await tx.insert(events).values({
      id,
      title: p.title,
      description: p.description,
      location: p.location,
      ...formInstants(p),
      recurrenceFreq: p.recurrenceFreq === "none" ? null : p.recurrenceFreq,
      recurrenceByWeekday: p.recurrenceFreq === "weekly" ? p.recurrenceByWeekday : null,
      recurrenceInterval: p.recurrenceInterval,
      recurrenceUntil: p.recurrenceUntil ? parseHMInLocal(p.recurrenceUntil, "23:59") : null,
      links: p.links?.length ? p.links : null,
      createdByAdminId: adminId,
      draft: planning?.draft ?? false,
    });
    // A one-off event that hasn't happened yet gets its planning checklist.
    if (planning) {
      await planFromForm(tx, id, { tags: planning.tags, recurring: p.recurrenceFreq !== "none" });
    }
  });
  revalidateEventPages(id);
  return { ok: true as const, id, planned: await hasPlan(db, id) };
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
  const planning = planningFields(fd);
  // The event and its checklist change together; a missing event changes neither.
  const found = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(events)
      .set({
        title: p.title,
        description: p.description,
        location: p.location,
        ...formInstants(p),
        recurrenceFreq: p.recurrenceFreq === "none" ? null : p.recurrenceFreq,
        recurrenceByWeekday: p.recurrenceFreq === "weekly" ? p.recurrenceByWeekday : null,
        recurrenceInterval: p.recurrenceInterval,
        recurrenceUntil: p.recurrenceUntil ? parseHMInLocal(p.recurrenceUntil, "23:59") : null,
        ...(p.links ? { links: p.links.length ? p.links : null } : {}),
        updatedAt: new Date(),
        // Tells the event importer not to overwrite this admin's changes.
        adminEditedAt: new Date(),
        ...(planning ? { draft: planning.draft } : {}),
      })
      .where(eq(events.id, id))
      .returning({ id: events.id });
    if (!row) return false;
    // Moving the date moves the open tasks; done ones stay (lib/planning.ts).
    if (planning) {
      await planFromForm(tx, id, { tags: planning.tags, recurring: p.recurrenceFreq !== "none" });
    } else if (await hasPlan(tx, id)) {
      await syncPlan(tx, id);
    }
    return true;
  });
  if (!found) return { ok: false as const, error: "not_found" };
  revalidateEventPages(id);
  return { ok: true as const, id, planned: await hasPlan(db, id) };
}

export async function deleteEvent(id: string) {
  await requireAdminId();
  // Imported events leave a tombstone so the importer doesn't re-create them.
  await deleteEventRecordingImport(db, id);
  const storage = getStorage();
  if (storage) await cleanUp(`images of deleted event ${id}`, () => storage.deletePrefix(eventImagesPrefix(id)));
  revalidateEventPages(id);
  return { ok: true as const };
}

// Event images. Uploads are re-encoded into the variants (EXIF and GPS
// dropped) and never stored as sent. Every change counts as an admin edit,
// so the importer won't undo it (docs/import.md). Uploads must fit the
// server-action body limit in next.config.ts.

type ImagesResult = { ok: true; images: EventImage[] } | { ok: false; error: string };

async function eventImages(id: string): Promise<EventImage[] | null> {
  const [row] = await db.select({ images: events.images }).from(events).where(eq(events.id, id)).limit(1);
  return row ? (row.images ?? []) : null;
}

async function saveEventImages(id: string, current: EventImage[], next: EventImage[]): Promise<ImagesResult> {
  const now = new Date();
  await db.update(events)
    .set({ images: next.length ? next : null, updatedAt: now, adminEditedAt: now })
    .where(eq(events.id, id));
  const removed = current.filter((c) => !next.some((n) => n.id === c.id));
  const storage = getStorage();
  if (removed.length && storage) {
    await cleanUp(`removed images of ${id}`, () => deleteEventImageFiles(storage, id, removed));
  }
  revalidateEventPages(id);
  return { ok: true, images: next };
}

/**
 * Adds the "image" files of the form, at the end, or in place of the image
 * whose id is in "replaceId". An image the event already has is skipped.
 */
export async function uploadEventImages(id: string, fd: FormData): Promise<ImagesResult> {
  await requireAdminId();
  const storage = getStorage();
  if (!storage) return { ok: false, error: "Image storage isn't set up" };
  const files = fd.getAll("image").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, error: "Choose an image" };
  const replaceId = String(fd.get("replaceId") ?? "");
  const current = await eventImages(id);
  if (!current) return { ok: false, error: "Event not found" };
  const at = replaceId ? current.findIndex((img) => img.id === replaceId) : current.length;
  if (at < 0) return { ok: false, error: "That image was already removed" };
  const kept = current.filter((img) => img.id !== replaceId);
  if (kept.length + files.length > EVENT_IMAGES_MAX) {
    return { ok: false, error: `An event can have at most ${EVENT_IMAGES_MAX} images` };
  }

  const added: EventImage[] = [];
  for (const file of files) {
    let processed;
    try {
      processed = await processEventImage(Buffer.from(await file.arrayBuffer()));
    } catch (err) {
      if (err instanceof ImageRejectedError) return { ok: false, error: `${file.name}: ${err.message}` };
      throw err;
    }
    if ([...kept, ...added].some((img) => img.id === processed.id)) continue;
    added.push(await storeEventImage(storage, id, processed, { origin: "admin" }));
  }
  const next = [...kept.slice(0, at), ...added, ...kept.slice(at)];
  return saveEventImages(id, current, next);
}

const imageOrderSchema = z
  .array(z.strictObject({ id: imageId, alt: imageAlt.optional() }))
  .max(EVENT_IMAGES_MAX);

/**
 * Sets the order and alt text of the event's images: list the ids to keep,
 * in order. Images left out are removed.
 */
export async function setEventImages(
  id: string,
  order: { id: string; alt?: string }[]
): Promise<ImagesResult> {
  await requireAdminId();
  const parsed = imageOrderSchema.safeParse(order);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" };
  const current = await eventImages(id);
  if (!current) return { ok: false, error: "Event not found" };
  const next: EventImage[] = [];
  for (const o of parsed.data) {
    const img = current.find((c) => c.id === o.id);
    if (!img) return { ok: false, error: "That image was already removed" };
    if (next.some((n) => n.id === o.id)) continue;
    next.push(o.alt === undefined ? img : { ...img, alt: o.alt || undefined });
  }
  const same = next.length === current.length &&
    next.every((n, i) => n.id === current[i].id && n.alt === current[i].alt);
  if (same) return { ok: true, images: current };
  return saveEventImages(id, current, next);
}

export async function removeEventImage(id: string, imageId: string): Promise<ImagesResult> {
  await requireAdminId();
  const current = await eventImages(id);
  if (!current) return { ok: false, error: "Event not found" };
  if (!current.some((img) => img.id === imageId)) return { ok: true, images: current };
  return saveEventImages(id, current, current.filter((img) => img.id !== imageId));
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
