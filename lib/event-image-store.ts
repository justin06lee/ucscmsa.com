import { createHash } from "node:crypto";
import sharp, { type Metadata } from "sharp";
import {
  EVENT_IMAGE_VARIANTS,
  EVENT_IMAGE_WIDTHS,
  type EventImage,
  type EventImageVariant,
} from "@/lib/event-image";
import type { ObjectStorage } from "@/lib/storage";

// Server only: sharp is native. Every image is decoded and re-encoded, never
// served as uploaded, so what the site shows is a plain WebP with no
// metadata (EXIF, GPS) and nothing a browser could sniff as something else.

// Uploads larger than this are refused. Admin uploads are also capped by the
// request size (next.config.ts).
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
// Decompression-bomb guard: a small file can claim a huge canvas.
const MAX_INPUT_PIXELS = 50_000_000;
// Very tall images are scaled to fit at most this height : width.
const MAX_ASPECT = 3;
const INPUT_FORMATS = new Set(["jpeg", "png", "webp", "gif"]);
const QUALITY: Record<EventImageVariant, number> = { card: 78, page: 80, full: 82 };

export class ImageRejectedError extends Error {}

export type ProcessedImage = {
  id: string;
  w: number;
  h: number;
  files: Record<EventImageVariant, { data: Buffer; w: number; h: number }>;
};

/** The id an upload gets: the first 16 hex digits of its SHA-256. */
export function imageId(input: Buffer): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

/**
 * Decodes an upload and renders the variants. Throws ImageRejectedError for
 * anything that isn't a readable JPEG, PNG, WebP or GIF (first frame) within
 * the limits.
 */
export async function processEventImage(input: Buffer): Promise<ProcessedImage> {
  if (input.length === 0) throw new ImageRejectedError("The image is empty.");
  if (input.length > MAX_IMAGE_BYTES) {
    throw new ImageRejectedError(`The image must be at most ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`);
  }
  const opts = { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" } as const;
  let meta: Metadata;
  try {
    meta = await sharp(input, opts).metadata();
  } catch {
    throw new ImageRejectedError("Not a readable image.");
  }
  if (!meta.format || !INPUT_FORMATS.has(meta.format) || !meta.width || !meta.height) {
    throw new ImageRejectedError("Send a JPEG, PNG, WebP or GIF.");
  }
  // EXIF orientations 5-8 turn the picture on its side.
  const sideways = (meta.orientation ?? 1) >= 5;

  const files = {} as ProcessedImage["files"];
  try {
    for (const variant of EVENT_IMAGE_VARIANTS) {
      const width = EVENT_IMAGE_WIDTHS[variant];
      const { data, info } = await sharp(input, opts)
        .rotate() // apply EXIF orientation before metadata is dropped
        .resize({ width, height: width * MAX_ASPECT, fit: "inside", withoutEnlargement: true })
        .webp({ quality: QUALITY[variant] })
        .toBuffer({ resolveWithObject: true });
      files[variant] = { data, w: info.width, h: info.height };
    }
  } catch {
    throw new ImageRejectedError("Not a readable image.");
  }
  return {
    id: imageId(input),
    w: sideways ? meta.height : meta.width,
    h: sideways ? meta.width : meta.height,
    files,
  };
}

// Variants are named by the image's id, so a path's bytes never change and
// can be cached for a year.
const variantPath = (eventId: string, id: string, variant: EventImageVariant) =>
  `${eventImagesPrefix(eventId)}${id}-${variant}.webp`;

/** Every stored object of an event is under this prefix. */
export const eventImagesPrefix = (eventId: string) => `flyers/${eventId}/`;

/** Uploads the variants and returns the event's entry for this image. */
export async function storeEventImage(
  storage: ObjectStorage,
  eventId: string,
  image: ProcessedImage,
  extra: Pick<EventImage, "origin" | "alt" | "src">
): Promise<EventImage> {
  const entry = { id: image.id, w: image.w, h: image.h, ...extra } as EventImage;
  for (const variant of EVENT_IMAGE_VARIANTS) {
    const f = image.files[variant];
    const url = await storage.put(variantPath(eventId, image.id, variant), f.data, "image/webp");
    entry[variant] = { url, w: f.w, h: f.h };
  }
  return entry;
}

/** Deletes the stored variants of these images. */
export async function deleteEventImageFiles(storage: ObjectStorage, eventId: string, images: EventImage[]) {
  await storage.delete(images.flatMap((img) =>
    EVENT_IMAGE_VARIANTS.map((variant) => variantPath(eventId, img.id, variant))
  ));
}

/** Best effort: removes files after the database already changed. */
export async function cleanUp(what: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (err) {
    console.error(`[images] couldn't delete ${what}:`, err);
  }
}
