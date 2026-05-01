import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getPrayerTimes } from "@/lib/aladhan";

export const revalidate = 3600;

// In-memory token bucket per IP. Module-level state survives across requests
// in a single Node process. Each serverless instance gets its own bucket,
// which is a known limitation but still meaningful protection against a
// single client hammering one warm instance.
const RATE_CAPACITY = 30;
const RATE_WINDOW_MS = 60_000;
const RATE_REFILL_PER_MS = RATE_CAPACITY / RATE_WINDOW_MS;
const STALE_AFTER_MS = 5 * 60_000;

type Bucket = { tokens: number; refilledAt: number };
const buckets = new Map<string, Bucket>();

function purgeStale(now: number): void {
  for (const [key, b] of buckets) {
    if (now - b.refilledAt > STALE_AFTER_MS) {
      buckets.delete(key);
    }
  }
}

function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "__unknown__";
}

function take(key: string): boolean {
  const now = Date.now();
  purgeStale(now);
  const existing = buckets.get(key);
  if (!existing) {
    buckets.set(key, { tokens: RATE_CAPACITY - 1, refilledAt: now });
    return true;
  }
  const elapsed = now - existing.refilledAt;
  const refilled = Math.min(
    RATE_CAPACITY,
    existing.tokens + elapsed * RATE_REFILL_PER_MS
  );
  if (refilled < 1) {
    existing.tokens = refilled;
    existing.refilledAt = now;
    return false;
  }
  existing.tokens = refilled - 1;
  existing.refilledAt = now;
  return true;
}

export async function GET(req: Request) {
  if (!take(clientKey(req))) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "date query param required, format YYYY-MM-DD" },
      { status: 400 }
    );
  }
  const times = await getPrayerTimes(date, db);
  return NextResponse.json({ date, times });
}
