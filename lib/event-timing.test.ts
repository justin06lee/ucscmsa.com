import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", async () => {
  const { createTestDb } = await import("@/test/db");
  return { db: (await createTestDb()).db };
});

import { db } from "@/lib/db/client";
import { events } from "@/lib/db/schema";
import { findOccurrence, getUpcomingOccurrences } from "@/lib/db/queries";
import { eventInstants, localInstant, timingOf } from "@/lib/event-rules";
import { expandEvents, type EventInput } from "@/lib/rrule-lite";
import { endOfLocalDayUtc, startOfLocalDayUtc, toLocalYmd } from "@/lib/time";
import { eventInputSchema } from "@/app/admin/_schemas";

function ev(over: Partial<EventInput> & Pick<EventInput, "startTime" | "endTime">): EventInput {
  return {
    id: "e",
    title: "Event",
    description: "",
    location: "",
    recurrenceFreq: null,
    recurrenceByWeekday: null,
    recurrenceInterval: 1,
    recurrenceUntil: null,
    cancellations: [],
    ...over,
  };
}

const ymds = (out: { occurrenceStart: Date }[]) => out.map((o) => toLocalYmd(o.occurrenceStart));

describe("timingOf and eventInstants", () => {
  it("reads the timing from which times are given", () => {
    expect(timingOf("13:30", "14:30")).toBe("timed");
    expect(timingOf("18:00", undefined)).toBe("start_only");
    expect(timingOf(undefined, undefined)).toBe("date_only");
    expect(timingOf("", "")).toBe("date_only");
    expect(timingOf(undefined, "14:30")).toBeNull();
  });

  it("anchors unknown times to the Santa Cruz day, on both sides of DST", () => {
    expect(eventInstants({ date: "2026-10-23" })).toEqual({
      timing: "date_only",
      startTime: new Date("2026-10-23T07:00:00.000Z"), // midnight PDT
      endTime: new Date("2026-10-24T06:59:59.999Z"),
    });
    expect(eventInstants({ date: "2026-10-23", startTime: "18:00" })).toEqual({
      timing: "start_only",
      startTime: new Date("2026-10-24T01:00:00.000Z"),
      endTime: new Date("2026-10-24T06:59:59.999Z"),
    });
    // Oct 30 (PDT) to Nov 1, the day clocks fall back: ends 23:59:59.999 PST.
    const weekend = eventInstants({ date: "2026-10-30", endDate: "2026-11-01" });
    expect(weekend.startTime.toISOString()).toBe("2026-10-30T07:00:00.000Z");
    expect(weekend.endTime.toISOString()).toBe("2026-11-02T07:59:59.999Z");
    expect(eventInstants({ date: "2026-10-23", startTime: "13:30", endTime: "14:30" }).timing).toBe("timed");
    expect(() => eventInstants({ date: "2026-10-23", endTime: "18:00" })).toThrow();
  });
});

describe("expanding date-only and start-only events", () => {
  it("keeps a weekly date-only event on whole Santa Cruz days across both DST changes", () => {
    for (const [first, rangeStart, rangeEnd, expected] of [
      ["2026-02-22", "2026-02-20", "2026-03-20", ["2026-02-22", "2026-03-01", "2026-03-08", "2026-03-15"]],
      ["2026-10-18", "2026-10-15", "2026-11-12", ["2026-10-18", "2026-10-25", "2026-11-01", "2026-11-08"]],
    ] as const) {
      const out = expandEvents(
        [ev({ ...eventInstants({ date: first }), recurrenceFreq: "weekly" })],
        new Date(`${rangeStart}T12:00:00Z`),
        new Date(`${rangeEnd}T12:00:00Z`)
      );
      expect(ymds(out)).toEqual(expected);
      for (const o of out) {
        const day = toLocalYmd(o.occurrenceStart);
        expect(o.occurrenceStart).toEqual(startOfLocalDayUtc(day));
        expect(o.occurrenceEnd).toEqual(endOfLocalDayUtc(day));
        expect(o.timing).toBe("date_only");
      }
    }
  });

  it("ends multi-day and start-only occurrences at the end of their last local day", () => {
    // Friday to Sunday, weekly; the first weekend ends on the fall-back day.
    const weekend = expandEvents(
      [ev({ ...eventInstants({ date: "2026-10-30", endDate: "2026-11-01" }), recurrenceFreq: "weekly" })],
      new Date("2026-10-29T12:00:00Z"),
      new Date("2026-11-10T12:00:00Z")
    );
    expect(weekend.map((o) => o.occurrenceEnd)).toEqual([endOfLocalDayUtc("2026-11-01"), endOfLocalDayUtc("2026-11-08")]);

    const dinner = expandEvents(
      [ev({ ...eventInstants({ date: "2026-10-25", startTime: "18:00" }), recurrenceFreq: "weekly" })],
      new Date("2026-10-24T12:00:00Z"),
      new Date("2026-11-05T12:00:00Z")
    );
    expect(dinner.map((o) => [o.occurrenceStart, o.occurrenceEnd, o.timing])).toEqual([
      [localInstant("2026-10-25", "18:00"), endOfLocalDayUtc("2026-10-25"), "start_only"],
      [localInstant("2026-11-01", "18:00"), endOfLocalDayUtc("2026-11-01"), "start_only"],
    ]);
  });

  it("sorts a date-only event first in its day", () => {
    const day = "2026-10-23";
    const midnight = startOfLocalDayUtc(day);
    const out = expandEvents(
      [
        ev({ id: "timed-midnight", startTime: midnight, endTime: new Date(midnight.getTime() + 3_600_000) }),
        ev({ id: "dinner", ...eventInstants({ date: day, startTime: "18:00" }) }),
        ev({ id: "all-day", ...eventInstants({ date: day }) }),
      ],
      midnight,
      endOfLocalDayUtc(day)
    );
    expect(out.map((o) => o.eventId)).toEqual(["all-day", "timed-midnight", "dinner"]);
  });
});

describe("queries", () => {
  it("count a date-only event as upcoming through the end of its Santa Cruz day, and find it for RSVPs", async () => {
    await db.insert(events).values({ id: "potluck", title: "Potluck", ...eventInstants({ date: "2026-10-23" }) });
    const upcoming = async (now: Date) => (await getUpcomingOccurrences(10, now)).map((o) => o.eventId);

    expect(await upcoming(localInstant("2026-10-22", "20:00"))).toContain("potluck");
    expect(await upcoming(localInstant("2026-10-23", "23:30"))).toContain("potluck");
    expect(await upcoming(startOfLocalDayUtc("2026-10-24"))).not.toContain("potluck");

    // RSVPs key on the occurrence start: the start of the day.
    const occ = await findOccurrence("potluck", startOfLocalDayUtc("2026-10-23"), db);
    expect(occ).toMatchObject({ eventId: "potluck", timing: "date_only" });
    expect(await findOccurrence("potluck", localInstant("2026-10-23", "12:00"), db)).toBeNull();
  });
});

describe("admin form validation", () => {
  const form = (over: Record<string, string>) =>
    eventInputSchema.safeParse({ title: "Potluck", startDate: "2026-10-23", endDate: "2026-10-23", ...over });

  it("accepts date-only and start-only events", () => {
    expect(form({ startTime: "", endTime: "" }).success).toBe(true);
    expect(form({}).success).toBe(true);
    expect(form({ startTime: "18:00", endTime: "" }).success).toBe(true);
    expect(form({ startDate: "2026-10-30", endDate: "2026-11-01" }).success).toBe(true);
  });

  it("rejects an end time without a start time, and an end date before the start", () => {
    const endOnly = form({ startTime: "", endTime: "18:00" });
    expect(endOnly.success).toBe(false);
    expect(endOnly.error?.issues[0].message).toMatch(/end time needs a start time/);
    expect(form({ startDate: "2026-10-23", endDate: "2026-10-22" }).success).toBe(false);
    expect(form({ startTime: "15:00", endTime: "14:00" }).success).toBe(false);
  });
});
