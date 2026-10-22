import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { guardImport, importFail as fail, readJsonBody } from "@/lib/import/http";
import { applyImagesImport, ImageItemError } from "@/lib/import/images";
import { IMAGES_RATE_LIMITS, imagesRequestSchema, MAX_BODY_BYTES } from "@/lib/import/schema";
import { BLOB_TOKEN_ENV, getStorage } from "@/lib/storage";

// PUT /api/import/events/images — sets the whole, ordered image list of one
// imported event. Same token, error format and conflict policy as
// POST /api/import/events; see docs/import.md.

// Up to ten uploads are fetched and re-encoded in one request.
export const maxDuration = 120;

export async function PUT(req: Request) {
  try {
    const denied = await guardImport(req, "import-images", IMAGES_RATE_LIMITS);
    if (denied) return denied;
    const storage = getStorage();
    if (!storage) {
      return fail(503, "images_disabled", `Image import is turned off: ${BLOB_TOKEN_ENV} is not set.`);
    }

    const parsed = await readJsonBody(req, imagesRequestSchema, MAX_BODY_BYTES);
    if ("error" in parsed) return parsed.error;

    const result = await applyImagesImport(db, storage, parsed.data);
    if (result.status === "updated" && !result.dryRun && result.eventId) {
      revalidatePath("/");
      revalidatePath("/calendar");
      revalidatePath("/admin");
      revalidatePath(`/calendar/events/${result.eventId}`);
    }
    return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof ImageItemError) {
      return fail(err.status, err.code, `images[${err.index}]: ${err.message} Nothing was changed.`, { index: err.index });
    }
    console.error("[import] images failed:", err);
    return fail(500, "internal_error", "The image import failed; the event's images are unchanged. Retrying is safe.");
  }
}
