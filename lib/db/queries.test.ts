import { describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { admins, eventCancellations, events, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { findOccurrence, getPastOccurrences } from "./queries";

async function setup() {
  const t = await createTestDb();
  await t.db.insert(users).values({ id: "u1", email: "a@ucsc.edu" });
  const [admin] = await t.db.insert(admins).values({ userId: "u1" }).returning();
  // Weekly Friday 1:30 PM PST from Jan 9 2026.
  await t.db.insert(events).values({
    id: "jummah",
    title: "Jummah",
    startTime: new Date("2026-01-09T21:30:00.000Z"),
    endTime: new Date("2026-01-09T22:30:00.000Z"),
    recurrenceFreq: "weekly",
    recurrenceByWeekday: "FR",
    createdByAdminId: admin.id,
  });
  await t.db.insert(eventCancellations).values({ eventId: "jummah", occurrenceDate: "2026-04-10" });
  return t;
}

describe("findOccurrence", () => {
  it("finds a real occurrence, including one after a DST change", async () => {
    const { db, client } = await setup();
    const occ = await findOccurrence("jummah", new Date("2026-04-03T20:30:00.000Z"), db);
    expect(occ?.occurrenceStart.toISOString()).toBe("2026-04-03T20:30:00.000Z");
    expect(await findOccurrence("jummah", new Date("2026-01-16T21:30:00.000Z"), db)).not.toBeNull();
    client.close();
  });

  it("rejects off-schedule times, cancelled dates, unknown events and invalid dates", async () => {
    const { db, client } = await setup();
    expect(await findOccurrence("jummah", new Date("2026-04-03T21:30:00.000Z"), db)).toBeNull();
    expect(await findOccurrence("jummah", new Date("2026-04-04T20:30:00.000Z"), db)).toBeNull();
    expect(await findOccurrence("jummah", new Date("2026-04-10T20:30:00.000Z"), db)).toBeNull();
    expect(await findOccurrence("nope", new Date("2026-04-03T20:30:00.000Z"), db)).toBeNull();
    expect(await findOccurrence("jummah", new Date("garbage"), db)).toBeNull();
    client.close();
  });
});

describe("cancelled events", () => {
  it("have no occurrences to RSVP to (the calendar side is tested in the import route tests)", async () => {
    const { db, client } = await setup();
    const start = new Date("2026-04-03T20:30:00.000Z");
    await db.update(events).set({ cancelledAt: new Date() }).where(eq(events.id, "jummah"));
    expect(await findOccurrence("jummah", start, db)).toBeNull();
    client.close();
  });
});

describe("getPastOccurrences", () => {
  it("lists ended one-off events newest first, without series, cancelled or ongoing events", async () => {
    const { db, client } = await setup();
    const now = new Date("2026-04-20T19:00:00.000Z");
    const oneOff = (id: string, start: string, hours: number, extra = {}) => ({
      id,
      title: id,
      startTime: new Date(start),
      endTime: new Date(new Date(start).getTime() + hours * 3_600_000),
      createdByAdminId: 1,
      ...extra,
    });
    await db.insert(events).values([
      oneOff("older", "2026-03-01T02:00:00.000Z", 2),
      oneOff("newest", "2026-04-18T02:00:00.000Z", 2),
      oneOff("middle", "2026-04-02T02:00:00.000Z", 2),
      oneOff("cancelled", "2026-04-19T02:00:00.000Z", 2, { cancelledAt: new Date("2026-04-10T00:00:00.000Z") }),
      oneOff("ongoing", "2026-04-20T18:00:00.000Z", 2),
      oneOff("upcoming", "2026-04-25T02:00:00.000Z", 2),
    ]);
    const past = await getPastOccurrences(3, now, db);
    expect(past.map((o) => o.eventId)).toEqual(["newest", "middle", "older"]);
    expect(past[0].occurrenceStart.toISOString()).toBe("2026-04-18T02:00:00.000Z");
    expect((await getPastOccurrences(10, now, db)).map((o) => o.eventId)).not.toContain("jummah");
    client.close();
  });
});
