import type { EventImage } from "./event-image";

// What the flyer UI needs of an image, whatever stores it: a URL and its size,
// so the page can hold the space before it loads. The UI takes these, never
// the storage records; toFlyers() is the one place that knows both.
export type FlyerImage = { src: string; width: number; height: number; alt: string };

// One flyer at the sizes the site shows it: a thumbnail on cards, the event
// page, and the full-screen viewer.
export type Flyer = { card: FlyerImage; page: FlyerImage; full: FlyerImage };

/** "Game Night flyer", or "Game Night flyer, 2 of 3" when an event has several. */
export function flyerAlt(title: string, index = 0, count = 1): string {
  return count > 1 ? `${title} flyer, ${index + 1} of ${count}` : `${title} flyer`;
}

/** An event's images as flyers, in order. Alt text an admin wrote wins. */
export function toFlyers(images: EventImage[] | null | undefined, title: string): Flyer[] {
  const list = images ?? [];
  return list.map((img, i) => {
    const alt = img.alt?.trim() || flyerAlt(title, i, list.length);
    return {
      card: { src: img.card.url, width: img.card.w, height: img.card.h, alt },
      page: { src: img.page.url, width: img.page.w, height: img.page.h, alt },
      full: { src: img.full.url, width: img.full.w, height: img.full.h, alt },
    };
  });
}

/** A card's thumbnail: the event's first image, small. */
export function coverThumb(cover: EventImage | null | undefined, title: string): FlyerImage | null {
  return cover ? toFlyers([cover], title)[0].card : null;
}
