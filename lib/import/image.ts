import { and, eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { eventImportTombstones, events } from "@/lib/db/schema";
import { clearEventImage, writeEventImage, type ProcessedImage } from "@/lib/event-image-store";
import type { EventImageMeta } from "@/lib/event-image";

export type ImageImportResult = {
  status: "created" | "updated" | "unchanged" | "removed" | "conflict" | "not_found";
  eventId?: string;
  reason?: "edited_by_admin" | "deleted_by_admin";
  image?: EventImageMeta;
};

/**
 * Sets (image) or removes (image: null) the image of the event imported as
 * (source, sourceId). Same conflict policy as upserts (docs/import.md): an
 * image is event content, so an event an admin edited — including an admin
 * removing its image — is left alone unless override is set. Unlike an
 * upsert, override doesn't clear adminEditedAt: the admin's other edits
 * still stand.
 */
export async function applyImageImport(
  db: DB,
  op: { source: string; sourceId: string; override?: boolean; image: ProcessedImage | null },
  now: Date = new Date()
): Promise<ImageImportResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: events.id, image: events.image, adminEditedAt: events.adminEditedAt })
      .from(events)
      .where(and(eq(events.source, op.source), eq(events.sourceId, op.sourceId)))
      .limit(1);
    if (!row) {
      const [tombstone] = await tx
        .select({ eventId: eventImportTombstones.eventId })
        .from(eventImportTombstones)
        .where(and(
          eq(eventImportTombstones.source, op.source),
          eq(eventImportTombstones.sourceId, op.sourceId),
        ))
        .limit(1);
      return tombstone ? { status: "conflict", reason: "deleted_by_admin" } : { status: "not_found" };
    }

    const base = { eventId: row.id };
    const current = row.image ?? undefined;
    if ((op.image?.meta.v ?? null) === (current?.v ?? null)) {
      return { ...base, status: "unchanged", image: current };
    }
    if (row.adminEditedAt && !op.override) {
      return { ...base, status: "conflict", reason: "edited_by_admin", image: current };
    }
    if (!op.image) {
      await clearEventImage(tx, row.id, now);
      await tx.update(events).set({ lastImportedAt: now }).where(eq(events.id, row.id));
      return { ...base, status: "removed" };
    }
    await writeEventImage(tx, row.id, op.image, now);
    await tx.update(events).set({ lastImportedAt: now }).where(eq(events.id, row.id));
    return { ...base, status: current ? "updated" : "created", image: op.image.meta };
  });
}
