// An event's images (flyers): up to EVENT_IMAGES_MAX per event, in order,
// stored on the events row as JSON (events.images). Each is served only as
// the WebP variants the server made from the upload, in the public Blob
// store (lib/storage.ts); the upload itself is deleted. Safe to import from
// client components; processing is in lib/event-image-store.ts.

export const EVENT_IMAGES_MAX = 10;
export const IMAGE_ALT_MAX = 300;

// "card" for lists and calendar views, "page" for the event page, "full" for
// the full-screen viewer, where text-heavy flyers get pinch-zoomed. Each is
// at most this wide; narrower uploads are never enlarged.
export const EVENT_IMAGE_VARIANTS = ["card", "page", "full"] as const;
export type EventImageVariant = (typeof EVENT_IMAGE_VARIANTS)[number];
export const EVENT_IMAGE_WIDTHS: Record<EventImageVariant, number> = { card: 480, page: 1200, full: 2000 };

export type EventImageFile = { url: string; w: number; h: number };

export type EventImage = {
  // The first 16 hex digits of the upload's SHA-256: the same picture
  // uploaded again is recognised as already attached.
  id: string;
  // The upload's dimensions, upright (EXIF rotation applied).
  w: number;
  h: number;
  alt?: string;
  origin: "import" | "admin";
  // For imports: the store path the upload came from (since deleted), so a
  // re-sent request naming it is recognised without fetching it.
  src?: string;
} & Record<EventImageVariant, EventImageFile>;
