import { createHash, timingSafeEqual } from "node:crypto";

export const IMPORT_TOKEN_ENV = "EVENT_IMPORT_TOKEN";
export const MIN_TOKEN_LENGTH = 32;

export type TokenCheck =
  | { ok: true; tokenId: string }
  | { ok: false; reason: "disabled" | "unauthorized" };

function sha256(s: string): Buffer {
  return createHash("sha256").update(s, "utf8").digest();
}

/**
 * Checks an `Authorization: Bearer <token>` header against the configured
 * token. Fails closed: with no token configured, or one shorter than
 * MIN_TOKEN_LENGTH, nothing is accepted. Both sides are hashed first, so the
 * comparison is constant-time whatever the lengths. `tokenId` names the token
 * (a hash prefix, not the token) for rate-limit keys.
 */
export function checkImportToken(
  authorization: string | null,
  configured: string | undefined
): TokenCheck {
  const expected = configured?.trim();
  if (!expected || expected.length < MIN_TOKEN_LENGTH) {
    return { ok: false, reason: "disabled" };
  }
  const presented = authorization?.match(/^Bearer\s+(\S+)\s*$/i)?.[1];
  if (!presented) return { ok: false, reason: "unauthorized" };
  const expectedHash = sha256(expected);
  if (!timingSafeEqual(sha256(presented), expectedHash)) {
    return { ok: false, reason: "unauthorized" };
  }
  return { ok: true, tokenId: expectedHash.toString("hex").slice(0, 16) };
}
