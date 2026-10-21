import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import type { DB } from "@/lib/db/client";
import { eventImages, events } from "@/lib/db/schema";
import {
  EVENT_IMAGE_VARIANTS,
  EVENT_IMAGE_WIDTHS,
  type EventImageMeta,
  type EventImageVariant,
} from "@/lib/event-image";

// Server only: sharp is native. Uploads are decoded and re-encoded, never
// stored as sent, so what we serve is always a plain WebP with no metadata
// (EXIF, GPS) and nothing the browser could sniff as something else.

// Under Vercel's 4.5 MB request body limit for functions.
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
// Decompression-bomb guard: a small file can claim a huge canvas.
const MAX_INPUT_PIXELS = 40_000_000;
// Very tall images are scaled down to fit at most this height : width.
const MAX_ASPECT = 2;
const INPUT_FORMATS = new Set(["jpeg", "png", "webp", "gif"]);
// Bump when the output settings change, so every URL changes with them.
const PIPELINE = "webp80-r1";

export class ImageRejectedError extends Error {}

export type ProcessedImage = {
  meta: EventImageMeta;
  data: Record<EventImageVariant, Buffer>;
};

/**
 * Decodes an uploaded image and renders the stored variants. Throws
 * ImageRejectedError for anything that isn't a readable JPEG, PNG, WebP or
 * GIF (first frame) within the size limits.
 */
export async function processEventImage(input: Buffer): Promise<ProcessedImage> {
  if (input.length === 0) throw new ImageRejectedError("The image is empty.");
  if (input.length > MAX_IMAGE_BYTES) {
    throw new ImageRejectedError(`The image must be at most ${MAX_IMAGE_BYTES} bytes.`);
  }
  const opts = { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" } as const;
  let format: string | undefined;
  try {
    format = (await sharp(input, opts).metadata()).format;
  } catch {
    throw new ImageRejectedError("Not a readable image.");
  }
  if (!format || !INPUT_FORMATS.has(format)) {
    throw new ImageRejectedError("Send a JPEG, PNG, WebP or GIF.");
  }

  const meta = {
    v: createHash("sha256").update(PIPELINE).update(input).digest("hex").slice(0, 16),
  } as EventImageMeta;
  const data = {} as ProcessedImage["data"];
  try {
    for (const variant of EVENT_IMAGE_VARIANTS) {
      const width = EVENT_IMAGE_WIDTHS[variant];
      const { data: out, info } = await sharp(input, opts)
        .rotate() // apply EXIF orientation before it is stripped
        .resize({ width, height: width * MAX_ASPECT, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer({ resolveWithObject: true });
      data[variant] = out;
      meta[variant] = { w: info.width, h: info.height };
    }
  } catch {
    throw new ImageRejectedError("Not a readable image.");
  }
  return { meta, data };
}

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/** Replaces an event's image rows and events.image. Call inside a transaction. */
export async function writeEventImage(tx: Tx, eventId: string, image: ProcessedImage, now: Date) {
  await tx.delete(eventImages).where(eq(eventImages.eventId, eventId));
  await tx.insert(eventImages).values(
    EVENT_IMAGE_VARIANTS.map((variant) => ({ eventId, variant, data: image.data[variant] }))
  );
  await tx.update(events).set({ image: image.meta, updatedAt: now }).where(eq(events.id, eventId));
}

/** Removes an event's image rows and clears events.image. Call inside a transaction. */
export async function clearEventImage(tx: Tx, eventId: string, now: Date) {
  await tx.delete(eventImages).where(eq(eventImages.eventId, eventId));
  await tx.update(events).set({ image: null, updatedAt: now }).where(eq(events.id, eventId));
}

/** The stored bytes of one variant with the event's current image version. */
export async function readEventImage(db: DB, eventId: string, variant: EventImageVariant) {
  const [row] = await db
    .select({ image: events.image, data: eventImages.data })
    .from(events)
    .innerJoin(eventImages, and(eq(eventImages.eventId, events.id), eq(eventImages.variant, variant)))
    .where(eq(events.id, eventId))
    .limit(1);
  return row?.image ? { meta: row.image, data: row.data } : null;
}
