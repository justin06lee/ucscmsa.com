import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { EVENT_IMAGE_VARIANTS, eventImageUrl, type EventImageMeta } from "@/lib/event-image";
import { ImageRejectedError, MAX_IMAGE_BYTES, processEventImage } from "@/lib/event-image-store";
import { applyImageImport } from "@/lib/import/image";
import { guardImport, importFail as fail } from "@/lib/import/http";
import { IMAGE_RATE_LIMITS, source, sourceId } from "@/lib/import/schema";

// PUT /api/import/events/image?source=…&sourceId=… with the image as the raw
// body sets the image of an imported event; DELETE with the same query
// removes it. Same token, error format and conflict policy as
// POST /api/import/events; see docs/import.md.

const query = z.strictObject({
  source,
  sourceId,
  override: z.enum(["true", "false"]).optional(),
});

// Reads the body, giving up as soon as it passes max bytes: Content-Length
// can be missing or wrong.
async function readBody(req: Request, max: number): Promise<Buffer | null> {
  if (!req.body) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = req.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function describe(eventId: string, image: EventImageMeta) {
  return Object.fromEntries(EVENT_IMAGE_VARIANTS.map((variant) => [variant, {
    url: eventImageUrl(eventId, image, variant),
    width: image[variant].w,
    height: image[variant].h,
  }]));
}

async function handle(req: Request, mode: "put" | "delete") {
  try {
    const denied = await guardImport(req, "import-image", IMAGE_RATE_LIMITS);
    if (denied) return denied;

    const q = query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!q.success) {
      return fail(400, "invalid_request", "The query needs source and sourceId (and optionally override=true); nothing was changed.", {
        issues: q.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }

    let image = null;
    if (mode === "put") {
      if (!req.headers.get("content-type")?.toLowerCase().startsWith("image/")) {
        return fail(415, "unsupported_media_type", "Send the image as the body with an image/* Content-Type.");
      }
      const tooLarge = () => fail(413, "payload_too_large", `The image must be at most ${MAX_IMAGE_BYTES} bytes.`);
      if (Number(req.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) return tooLarge();
      const body = await readBody(req, MAX_IMAGE_BYTES);
      if (!body) return tooLarge();
      try {
        image = await processEventImage(body);
      } catch (err) {
        if (err instanceof ImageRejectedError) return fail(422, "invalid_image", err.message);
        throw err;
      }
    }

    const { image: meta, ...result } = await applyImageImport(db, {
      source: q.data.source,
      sourceId: q.data.sourceId,
      override: q.data.override === "true",
      image,
    });
    if (result.eventId && ["created", "updated", "removed"].includes(result.status)) {
      revalidatePath("/");
      revalidatePath("/calendar");
      revalidatePath("/admin");
      revalidatePath(`/calendar/events/${result.eventId}`);
    }
    return Response.json(
      { ok: true, ...result, ...(meta && result.eventId ? { image: describe(result.eventId, meta) } : {}) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[import] image failed:", err);
    return fail(500, "internal_error", "The image import failed; nothing was changed. Retrying is safe.");
  }
}

export async function PUT(req: Request) {
  return handle(req, "put");
}

export async function DELETE(req: Request) {
  return handle(req, "delete");
}
