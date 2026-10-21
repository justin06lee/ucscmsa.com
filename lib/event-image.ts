// An event's flyer: stored as two pre-resized WebP variants (lib/db/schema.ts
// event_images) so pages never go through paid image optimization. This file
// is safe to import from client components; processing and storage are in
// lib/event-image-store.ts.

// Target widths. "card" is for lists and calendar cells, "full" for the
// event page and share image. Narrower uploads are never enlarged.
export const EVENT_IMAGE_VARIANTS = ["card", "full"] as const;
export type EventImageVariant = (typeof EVENT_IMAGE_VARIANTS)[number];
export const EVENT_IMAGE_WIDTHS: Record<EventImageVariant, number> = { card: 480, full: 1200 };

export function isEventImageVariant(s: string): s is EventImageVariant {
  return (EVENT_IMAGE_VARIANTS as readonly string[]).includes(s);
}

// Kept on the events row (events.image), so a page can lay the image out
// without layout shift and without reading the image rows. v changes
// whenever the image does; it is part of the URL, so a URL's bytes never
// change and can be cached for a year.
export type EventImageMeta = {
  v: string;
  card: { w: number; h: number };
  full: { w: number; h: number };
};

export function eventImageUrl(eventId: string, image: EventImageMeta, variant: EventImageVariant): string {
  return `/calendar/events/${encodeURIComponent(eventId)}/image/${variant}?v=${image.v}`;
}
