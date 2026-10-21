import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { IMPORT_RATE_LIMITS, importRequestSchema, MAX_BODY_BYTES } from "@/lib/import/schema";
import { applyImport } from "@/lib/import/apply";
import { guardImport, importFail as fail, readJsonBody } from "@/lib/import/http";

// POST /api/import/events — the event import API. Request and response
// formats, error codes and the conflict policy are in docs/import.md.
//
// Bearer-token auth only: no session or cookie is read, and proxy.ts only
// matches /admin, so it never runs here.

export async function POST(req: Request) {
  try {
    const denied = await guardImport(req, "import", IMPORT_RATE_LIMITS);
    if (denied) return denied;

    const parsed = await readJsonBody(req, importRequestSchema, MAX_BODY_BYTES);
    if ("error" in parsed) return parsed.error;

    const { results, changedEventIds } = await applyImport(db, parsed.data);

    if (changedEventIds.length > 0) {
      revalidatePath("/");
      revalidatePath("/calendar");
      revalidatePath("/admin");
      // Works on `next start`; on Vercel the sitemap waited for its hourly
      // revalidate anyway (2026-10-21). See docs/import.md.
      revalidatePath("/sitemap.xml");
      for (const id of changedEventIds) revalidatePath(`/calendar/events/${id}`);
    }

    const dryRun = parsed.data.dryRun === true ? { dryRun: true } : {};
    return Response.json({ ok: true, ...dryRun, results }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[import] failed:", err);
    return fail(500, "internal_error", "The import failed; nothing was applied. Retrying is safe.");
  }
}
