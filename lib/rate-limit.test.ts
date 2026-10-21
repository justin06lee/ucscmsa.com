import { describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { rateLimits } from "@/lib/db/schema";
import { hitRateLimit } from "./rate-limit";

const rule = { limit: 3, windowMs: 60_000 };

describe("hitRateLimit", () => {
  it("allows up to the limit per window, then says when to retry", async () => {
    const { db, client } = await createTestDb();
    const t0 = new Date("2026-10-20T12:00:10.000Z");
    for (let i = 0; i < 3; i++) {
      expect((await hitRateLimit(db, "k", rule, t0)).allowed).toBe(true);
    }
    expect(await hitRateLimit(db, "k", rule, t0)).toEqual({ allowed: false, retryAfterSec: 50 });
    // Other keys are counted separately.
    expect((await hitRateLimit(db, "other", rule, t0)).allowed).toBe(true);
    // The next window starts fresh.
    expect((await hitRateLimit(db, "k", rule, new Date("2026-10-20T12:01:00.000Z"))).allowed).toBe(true);
    client.close();
  });

  it("drops windows older than a day", async () => {
    const { db, client } = await createTestDb();
    await hitRateLimit(db, "k", rule, new Date("2026-10-18T12:00:00.000Z"));
    await hitRateLimit(db, "k", rule, new Date("2026-10-20T12:00:00.000Z"));
    const rows = await db.select().from(rateLimits);
    expect(rows.map((r) => new Date(r.windowStart).toISOString())).toEqual(["2026-10-20T12:00:00.000Z"]);
    client.close();
  });
});
