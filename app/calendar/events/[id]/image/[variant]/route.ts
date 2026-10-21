import { db } from "@/lib/db/client";
import { isEventImageVariant } from "@/lib/event-image";
import { readEventImage } from "@/lib/event-image-store";

// GET /calendar/events/<id>/image/<card|full>?v=<version>: an event's flyer,
// pre-resized at upload (lib/event-image-store.ts). Link to it with
// eventImageUrl(), which carries the current version: with that version
// browsers cache the response for a year and Vercel's CDN for a day, so the
// database is read about once a day per image and region, and a removed image
// stops being served within a day. Outside /api on purpose, so robots rules
// let social crawlers fetch it as a share image.

const notFound = () =>
  new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain", "Cache-Control": "public, max-age=0, s-maxage=60" },
  });

export async function GET(req: Request, { params }: { params: Promise<{ id: string; variant: string }> }) {
  const { id, variant } = await params;
  if (!isEventImageVariant(variant)) return notFound();
  const found = await readEventImage(db, id, variant);
  if (!found) return notFound();

  // An old or missing version still gets the current image, but only
  // briefly cached, so the URL starts serving the right bytes soon after a
  // change.
  const current = new URL(req.url).searchParams.get("v") === found.meta.v;
  return new Response(new Uint8Array(found.data), {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(found.data.length),
      "Cache-Control": current
        ? "public, max-age=31536000, s-maxage=86400, immutable"
        : "public, max-age=0, s-maxage=300",
      ETag: `"${found.meta.v}-${variant}"`,
    },
  });
}
