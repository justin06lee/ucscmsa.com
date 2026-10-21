import { db } from "@/lib/db/client";
import { checkImportToken, IMPORT_TOKEN_ENV } from "@/lib/import/auth";
import { hitRateLimit, type RateLimitRule } from "@/lib/rate-limit";

// Shared by the import routes under /api/import/events. Error format and
// codes are in docs/import.md.

export function importFail(
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

/**
 * Checks the bearer token, then counts the request against the rate limits
 * under `bucket`. Returns the error response to send, or null to go on.
 * Authenticates before touching the database, so anonymous traffic costs no
 * writes; a 32+ character random token can't be guessed by retrying.
 */
export async function guardImport(
  req: Request,
  bucket: string,
  limits: Record<"tokenAndIp" | "token", RateLimitRule>
): Promise<Response | null> {
  const auth = checkImportToken(req.headers.get("authorization"), process.env[IMPORT_TOKEN_ENV]);
  if (!auth.ok) {
    if (auth.reason === "disabled") {
      return importFail(503, "import_disabled", `Import is turned off: ${IMPORT_TOKEN_ENV} is not set (or is shorter than 32 characters).`);
    }
    return importFail(401, "unauthorized", "Missing or wrong bearer token.", {}, {
      "WWW-Authenticate": 'Bearer realm="event-import"',
    });
  }
  const ip = clientIp(req);
  for (const [key, rule] of [
    [`${bucket}:${auth.tokenId}:${ip}`, limits.tokenAndIp],
    [`${bucket}:${auth.tokenId}`, limits.token],
  ] as const) {
    const r = await hitRateLimit(db, key, rule);
    if (!r.allowed) {
      return importFail(429, "rate_limited", "Too many import requests; retry later.", {
        retryAfter: r.retryAfterSec,
      }, { "Retry-After": String(r.retryAfterSec) });
    }
  }
  return null;
}
