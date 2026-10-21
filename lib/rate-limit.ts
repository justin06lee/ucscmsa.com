import { lt, sql } from "drizzle-orm";
import { rateLimits } from "@/lib/db/schema";
import type { DB } from "@/lib/db/client";

export type RateLimitRule = { limit: number; windowMs: number };

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSec: number };

const KEEP_WINDOWS_MS = 24 * 60 * 60 * 1000;

/**
 * Fixed-window counter in the rate_limits table: one atomic upsert per hit,
 * so it holds across serverless instances without a separate service. Each
 * call costs a database write, so only call it for authenticated requests.
 */
export async function hitRateLimit(
  db: DB,
  key: string,
  rule: RateLimitRule,
  now: Date = new Date()
): Promise<RateLimitResult> {
  const t = now.getTime();
  const windowStart = Math.floor(t / rule.windowMs) * rule.windowMs;
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });

  // The first hit in a new window is a good moment to drop old windows.
  if (row.count === 1) {
    await db.delete(rateLimits).where(lt(rateLimits.windowStart, t - KEEP_WINDOWS_MS));
  }

  if (row.count > rule.limit) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((windowStart + rule.windowMs - t) / 1000)),
    };
  }
  return { allowed: true, remaining: rule.limit - row.count };
}
