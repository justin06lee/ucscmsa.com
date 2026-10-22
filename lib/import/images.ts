import { and, eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { eventImportTombstones, events } from "@/lib/db/schema";
import type { EventImage } from "@/lib/event-image";
import {
  cleanUp,
  deleteEventImageFiles,
  eventImagesPrefix,
  ImageRejectedError,
  MAX_IMAGE_BYTES,
  processEventImage,
  storeEventImage,
} from "@/lib/event-image-store";
import { TooLargeError, type ObjectStorage } from "@/lib/storage";
import type { ImagesRequest } from "./schema";

export type ImagesImportResult = {
  status: "updated" | "unchanged" | "conflict" | "not_found";
  eventId?: string;
  reason?: "edited_by_admin" | "deleted_by_admin";
  // The event's images after the request (as they stand, for a conflict).
  images?: EventImage[];
  dryRun?: true;
};

// A problem with one item: nothing was changed. Becomes a 4xx response.
export class ImageItemError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly index: number,
    message: string
  ) {
    super(message);
  }
}

const sameList = (a: EventImage[], b: EventImage[]) =>
  a.length === b.length && a.every((x, i) => x.id === b[i].id && (x.alt ?? null) === (b[i].alt ?? null));

/**
 * Replaces the image list of the event imported as (source, sourceId).
 * Uploads ({ url }) must be in our store under flyers/<event id>/; each is
 * fetched, re-encoded into the variants and then deleted, whatever the
 * outcome, so no upload stays public. Conflict policy as for upserts
 * (docs/import.md): an event an admin edited is left alone unless override
 * is set. Override doesn't clear adminEditedAt: the admin's other edits stand.
 * dryRun reports what would happen without fetching, storing or deleting.
 */
export async function applyImagesImport(
  db: DB,
  storage: ObjectStorage,
  req: ImagesRequest,
  now: Date = new Date()
): Promise<ImagesImportResult> {
  const dry = req.dryRun ? { dryRun: true as const } : {};
  const [row] = await db
    .select({ id: events.id, images: events.images, adminEditedAt: events.adminEditedAt })
    .from(events)
    .where(and(eq(events.source, req.source), eq(events.sourceId, req.sourceId)))
    .limit(1);
  if (!row) {
    const [tombstone] = await db
      .select({ eventId: eventImportTombstones.eventId })
      .from(eventImportTombstones)
      .where(and(
        eq(eventImportTombstones.source, req.source),
        eq(eventImportTombstones.sourceId, req.sourceId),
      ))
      .limit(1);
    return tombstone
      ? { status: "conflict", reason: "deleted_by_admin", ...dry }
      : { status: "not_found", ...dry };
  }

  const prefix = eventImagesPrefix(row.id);
  const uploads: string[] = [];
  type Item = { index: number; alt?: string } & ({ id: string } | { path: string });
  const items = req.images.map((item, index): Item => {
    if ("id" in item) return { index, alt: item.alt, id: item.id };
    const path = storage.pathOf(item.url);
    if (!path || !path.startsWith(prefix) || path.length === prefix.length) {
      throw new ImageItemError(400, "invalid_image_url", index,
        `Upload images to the store under ${prefix} and send that URL.`);
    }
    uploads.push(path);
    return { index, alt: item.alt, path };
  });

  try {
    const current = row.images ?? [];
    const result = { eventId: row.id, ...dry };

    // Resolve what doesn't need a fetch: kept images and re-sent uploads.
    const resolved = items.map((item) => {
      const found = current.find((img) => ("id" in item ? img.id === item.id : img.src === item.path));
      if (!found && "id" in item) {
        throw new ImageItemError(400, "unknown_image", item.index, `The event has no image ${item.id}.`);
      }
      return { item, found };
    });
    const withAlt = (img: EventImage, alt: string | undefined): EventImage =>
      alt === undefined ? img : { ...img, alt: alt || undefined };

    if (resolved.every((r) => r.found)) {
      const next = resolved.map((r) => withAlt(r.found!, r.item.alt));
      if (sameList(next, current)) return { ...result, status: "unchanged", images: current };
    }
    if (row.adminEditedAt && !req.override) {
      return { ...result, status: "conflict", reason: "edited_by_admin", images: current };
    }
    if (req.dryRun) return { ...result, status: "updated" };

    const next: EventImage[] = [];
    const stored: EventImage[] = [];
    try {
      for (const { item, found } of resolved) {
        let img = found;
        if (!img && "path" in item) {
          let bytes: Buffer | null;
          try {
            bytes = await storage.get(item.path, MAX_IMAGE_BYTES);
          } catch (err) {
            if (err instanceof TooLargeError) {
              throw new ImageItemError(422, "invalid_image", item.index, `The image must be at most ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`);
            }
            throw err;
          }
          if (!bytes) {
            throw new ImageItemError(422, "image_missing", item.index, `Nothing is stored at ${item.path}; upload it first.`);
          }
          let processed;
          try {
            processed = await processEventImage(bytes);
          } catch (err) {
            if (err instanceof ImageRejectedError) throw new ImageItemError(422, "invalid_image", item.index, err.message);
            throw err;
          }
          // The same picture under another name: keep the existing entry.
          img = current.find((c) => c.id === processed.id) ?? next.find((c) => c.id === processed.id);
          if (!img) {
            img = await storeEventImage(storage, row.id, processed, { origin: "import", src: item.path });
            stored.push(img);
          }
        }
        if (next.some((n) => n.id === img!.id)) continue; // listed twice
        next.push(withAlt(img!, item.alt));
      }
    } catch (err) {
      // Nothing was attached, so the variants made so far go too.
      await cleanUp(`unattached images of ${row.id}`, () => deleteEventImageFiles(storage, row.id, stored));
      throw err;
    }

    if (sameList(next, current)) return { ...result, status: "unchanged", images: current };

    await db.update(events)
      .set({ images: next.length ? next : null, lastImportedAt: now, updatedAt: now })
      .where(eq(events.id, row.id));
    const removed = current.filter((c) => !next.some((n) => n.id === c.id));
    if (removed.length) {
      await cleanUp(`replaced images of ${row.id}`, () => deleteEventImageFiles(storage, row.id, removed));
    }
    return { ...result, status: "updated", images: next };
  } finally {
    if (!req.dryRun && uploads.length) {
      await cleanUp(`uploads for ${row.id}`, () => storage.delete(uploads));
    }
  }
}
