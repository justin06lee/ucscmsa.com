import { describe, expect, it } from "vitest";
import { expandEvents, type EventInput } from "./rrule-lite";

const baseOneOff: EventInput = {
  id: "e1",
  title: "One-off",
  description: "",
  location: "",
  startTime: new Date("2026-04-16T19:00:00.000Z"), // 12:00 PDT
  endTime: new Date("2026-04-16T20:00:00.000Z"),
  recurrenceFreq: null,
  recurrenceByWeekday: null,
  recurrenceInterval: 1,
  recurrenceUntil: null,
  cancellations: [],
};

describe("expandEvents", () => {
  it("emits a one-off event when it overlaps the range", () => {
    const out = expandEvents(
      [baseOneOff],
      new Date("2026-04-16T00:00:00.000Z"),
      new Date("2026-04-17T00:00:00.000Z")
    );
    expect(out).toHaveLength(1);
    expect(out[0].eventId).toBe("e1");
  });

  it("excludes a one-off event outside the range", () => {
    const out = expandEvents(
      [baseOneOff],
      new Date("2026-04-01T00:00:00.000Z"),
      new Date("2026-04-10T00:00:00.000Z")
    );
    expect(out).toHaveLength(0);
  });

  it("expands daily recurrence", () => {
    const daily: EventInput = {
      ...baseOneOff,
      id: "d1",
      recurrenceFreq: "daily",
      recurrenceInterval: 1,
    };
    const out = expandEvents(
      [daily],
      new Date("2026-04-16T00:00:00.000Z"),
      new Date("2026-04-20T00:00:00.000Z") // 4 days (16,17,18,19)
    );
    expect(out).toHaveLength(4);
  });

  it("expands weekly recurrence with byWeekday MO,WE,FR (Santa Cruz local)", () => {
    // 2026-04-13 is a Monday (PDT); set base to that week.
    const weekly: EventInput = {
      ...baseOneOff,
      id: "w1",
      startTime: new Date("2026-04-13T19:00:00.000Z"), // Mon 12:00 PDT
      endTime: new Date("2026-04-13T20:00:00.000Z"),
      recurrenceFreq: "weekly",
      recurrenceByWeekday: "MO,WE,FR",
    };
    const out = expandEvents(
      [weekly],
      new Date("2026-04-13T00:00:00.000Z"),
      new Date("2026-04-20T00:00:00.000Z") // one week
    );
    // Expect Mon 4/13, Wed 4/15, Fri 4/17 — 3 occurrences
    expect(out.map((o) => o.occurrenceStart.toISOString())).toEqual([
      "2026-04-13T19:00:00.000Z",
      "2026-04-15T19:00:00.000Z",
      "2026-04-17T19:00:00.000Z",
    ]);
  });

  it("stops at recurrenceUntil", () => {
    const daily: EventInput = {
      ...baseOneOff,
      id: "d2",
      recurrenceFreq: "daily",
      recurrenceUntil: new Date("2026-04-18T00:00:00.000Z"),
    };
    const out = expandEvents(
      [daily],
      new Date("2026-04-16T00:00:00.000Z"),
      new Date("2026-04-30T00:00:00.000Z")
    );
    // 4/16, 4/17 only (until exclusive on 4/18 UTC midnight)
    expect(out).toHaveLength(2);
  });

  it("skips cancelled occurrences", () => {
    const daily: EventInput = {
      ...baseOneOff,
      id: "d3",
      recurrenceFreq: "daily",
      cancellations: ["2026-04-17"],
    };
    const out = expandEvents(
      [daily],
      new Date("2026-04-16T00:00:00.000Z"),
      new Date("2026-04-19T00:00:00.000Z")
    );
    expect(out.map((o) => o.occurrenceStart.toISOString())).toEqual([
      "2026-04-16T19:00:00.000Z",
      "2026-04-18T19:00:00.000Z",
    ]);
  });

  it("handles monthly recurrence on same day-of-month", () => {
    const monthly: EventInput = {
      ...baseOneOff,
      id: "m1",
      recurrenceFreq: "monthly",
    };
    const out = expandEvents(
      [monthly],
      new Date("2026-04-01T00:00:00.000Z"),
      new Date("2026-07-01T00:00:00.000Z")
    );
    // 4/16, 5/16, 6/16
    expect(out).toHaveLength(3);
  });

  it("monthly clamps day when source day does not exist (Jan 31 -> Feb 28)", () => {
    const monthly: EventInput = {
      ...baseOneOff,
      id: "m2",
      startTime: new Date("2026-01-31T19:00:00.000Z"),
      endTime: new Date("2026-01-31T20:00:00.000Z"),
      recurrenceFreq: "monthly",
    };
    const out = expandEvents(
      [monthly],
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-04-01T00:00:00.000Z")
    );
    // Jan 31, Feb 28 (clamp), Mar 31
    expect(out.map((o) => o.occurrenceStart.toISOString())).toEqual([
      "2026-01-31T19:00:00.000Z",
      "2026-02-28T19:00:00.000Z",
      "2026-03-31T19:00:00.000Z",
    ]);
  });

  it("expands yearly recurrence", () => {
    const yearly: EventInput = {
      ...baseOneOff,
      id: "y1",
      recurrenceFreq: "yearly",
    };
    const out = expandEvents(
      [yearly],
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2028-12-31T00:00:00.000Z")
    );
    expect(out).toHaveLength(3);
  });
});
