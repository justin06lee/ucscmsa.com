import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ userId: "u1" as string | null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getSession: async () => (h.userId ? { user: { id: h.userId } } : null),
}));
vi.mock("@/lib/db/client", async () => {
  const { createTestDb } = await import("@/test/db");
  return { db: (await createTestDb()).db };
});

import { db } from "@/lib/db/client";
import { eventRsvps, events, users } from "@/lib/db/schema";
import { rsvp } from "./_actions";

const form = (eventId: string, occurrenceStart: Date, status = "yes") => {
  const fd = new FormData();
  fd.set("eventId", eventId);
  fd.set("occurrenceStart", occurrenceStart.toISOString());
  fd.set("status", status);
  return fd;
};

beforeAll(async () => {
  await db.insert(users).values({ id: "u1", email: "a@ucsc.edu" });
  await db.insert(events).values([
    // 2026-10-21 18:00-20:00 PDT
    { id: "tonight", title: "Game Night", startTime: new Date("2026-10-22T01:00:00Z"), endTime: new Date("2026-10-22T03:00:00Z") },
  ]);
});

afterEach(() => vi.useRealTimers());

describe("rsvp", () => {
  it("is open before and during an occurrence, and closed once it has ended", async () => {
    const start = new Date("2026-10-22T01:00:00Z");
    vi.useFakeTimers({ now: new Date("2026-10-21T20:00:00Z"), toFake: ["Date"] });
    expect(await rsvp(form("tonight", start))).toEqual({ ok: true });
    vi.setSystemTime(new Date("2026-10-22T02:30:00Z"));
    expect(await rsvp(form("tonight", start, "maybe"))).toEqual({ ok: true });
    vi.setSystemTime(new Date("2026-10-22T03:00:00Z"));
    expect(await rsvp(form("tonight", start, "no"))).toEqual({ ok: false, error: "event_ended" });
    const [row] = await db.select().from(eventRsvps);
    expect(row.status).toBe("maybe");
  });

  it("still rejects unknown occurrences and signed-out users", async () => {
    expect(await rsvp(form("tonight", new Date("2026-10-22T02:00:00Z")))).toEqual({ ok: false, error: "invalid_input" });
    h.userId = null;
    expect(await rsvp(form("tonight", new Date("2026-10-22T01:00:00Z")))).toEqual({ ok: false, error: "login_required" });
    h.userId = "u1";
  });
});
