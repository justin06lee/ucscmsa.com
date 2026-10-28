import { createHmac, timingSafeEqual } from "node:crypto";

// The mute link in step emails carries the person's id and this signature, so
// it works without signing in and nobody can mute someone else.

export function muteToken(userId: string, secret: string): string {
  return createHmac("sha256", secret).update(`mute-step-emails:${userId}`).digest("base64url");
}

export function checkMuteToken(userId: string, token: string, secret: string): boolean {
  const want = Buffer.from(muteToken(userId, secret));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** The page link (asks first) and the one-click address mail apps POST to. */
export function muteLinks(siteUrl: string, userId: string, secret: string) {
  const q = new URLSearchParams({ u: userId, t: muteToken(userId, secret) }).toString();
  return { page: `${siteUrl}/unsubscribe?${q}`, oneClick: `${siteUrl}/api/notify/unsubscribe?${q}` };
}
