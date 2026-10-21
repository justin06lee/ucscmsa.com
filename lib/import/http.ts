import { db } from "@/lib/db/client";
import { checkImportToken, IMPORT_TOKEN_ENV } from "@/lib/import/auth";
import type { z } from "zod";
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

/**
 * Reads a JSON body of at most maxBytes and checks it against schema.
 * Returns the parsed data, or the error response to send.
 */
export async function readJsonBody<T extends z.ZodType>(
  req: Request,
  schema: T,
  maxBytes: number
): Promise<{ data: z.output<T> } | { error: Response }> {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return { error: importFail(415, "unsupported_media_type", "Send Content-Type: application/json.") };
  }
  const tooLarge = () => ({ error: importFail(413, "payload_too_large", `The body must be at most ${maxBytes} bytes.`) });
  if (Number(req.headers.get("content-length") ?? 0) > maxBytes) return tooLarge();
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) return tooLarge();

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { error: importFail(400, "invalid_json", "The body is not valid JSON.") };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      error: importFail(400, "invalid_request", "The request doesn't match the import schema; nothing was applied.", {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      }),
    };
  }
  return { data: parsed.data };
}
