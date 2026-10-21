import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { checkImportToken, IMPORT_TOKEN_ENV } from "@/lib/import/auth";
import { IMPORT_RATE_LIMITS, importRequestSchema, MAX_BODY_BYTES } from "@/lib/import/schema";
import { applyImport } from "@/lib/import/apply";
import { hitRateLimit } from "@/lib/rate-limit";

// POST /api/import/events — the event import API. Request and response
// formats, error codes and the conflict policy are in docs/import.md.
//
// Bearer-token auth only: no session or cookie is read, and proxy.ts only
// matches /admin, so it never runs here.

function fail(
  status: number,
  error: string,
  message: string,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {}
) {
  return Response.json(
    { ok: false, error, message, ...extra },
    { status, headers: { "Cache-Control": "no-store", ...headers } }
  );
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(req: Request) {
  // Authenticate before touching the database, so anonymous traffic costs
  // no writes. A 32+ character random token can't be guessed by retrying.
  const auth = checkImportToken(req.headers.get("authorization"), process.env[IMPORT_TOKEN_ENV]);
  if (!auth.ok) {
    if (auth.reason === "disabled") {
      return fail(503, "import_disabled", `Import is turned off: ${IMPORT_TOKEN_ENV} is not set (or is shorter than 32 characters).`);
    }
    return fail(401, "unauthorized", "Missing or wrong bearer token.", {}, {
      "WWW-Authenticate": 'Bearer realm="event-import"',
    });
  }

  try {
    const ip = clientIp(req);
    for (const [key, rule] of [
      [`import:${auth.tokenId}:${ip}`, IMPORT_RATE_LIMITS.tokenAndIp],
      [`import:${auth.tokenId}`, IMPORT_RATE_LIMITS.token],
    ] as const) {
      const r = await hitRateLimit(db, key, rule);
      if (!r.allowed) {
        return fail(429, "rate_limited", "Too many import requests; retry later.", {
          retryAfter: r.retryAfterSec,
        }, { "Retry-After": String(r.retryAfterSec) });
      }
    }

    if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return fail(415, "unsupported_media_type", "Send Content-Type: application/json.");
    }
    if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
      return fail(413, "payload_too_large", `The body must be at most ${MAX_BODY_BYTES} bytes.`);
    }
    const text = await req.text();
    if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
      return fail(413, "payload_too_large", `The body must be at most ${MAX_BODY_BYTES} bytes.`);
    }

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return fail(400, "invalid_json", "The body is not valid JSON.");
    }
    const parsed = importRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(400, "invalid_request", "The request doesn't match the import schema; nothing was applied.", {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }

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
