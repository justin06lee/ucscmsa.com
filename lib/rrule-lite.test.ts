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
    // Jan 31, Feb 28 (clamp), Mar 31 — all at 11:00 local; Mar 31 is PDT.
    expect(out.map((o) => o.occurrenceStart.toISOString())).toEqual([
      "2026-01-31T19:00:00.000Z",
      "2026-02-28T19:00:00.000Z",
      "2026-03-31T18:00:00.000Z",
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

  it("daily recurrence keeps the local wall-clock time across DST fall-back (Nov 1 2026)", () => {
    const daily: EventInput = {
      ...baseOneOff,
      id: "dst1",
      startTime: new Date("2026-10-31T19:00:00.000Z"), // Sat 12:00 PDT
      endTime: new Date("2026-10-31T20:00:00.000Z"),
      recurrenceFreq: "daily",
    };
    const out = expandEvents(
      [daily],
      new Date("2026-10-31T00:00:00.000Z"),
      new Date("2026-11-04T00:00:00.000Z") // 4 days: 10/31, 11/1, 11/2, 11/3
    );
    // 12:00 local every day: 19:00Z in PDT, 20:00Z once PST begins.
    expect(out.map((o) => o.occurrenceStart.toISOString())).toEqual([
      "2026-10-31T19:00:00.000Z",
      "2026-11-01T20:00:00.000Z",
      "2026-11-02T20:00:00.000Z",
      "2026-11-03T20:00:00.000Z",
    ]);
  });

  it("weekly byWeekday uses Santa Cruz local day-of-week even when UTC day differs", () => {
    // 2026-04-13T06:00:00.000Z is Monday 06:00 UTC, but 2026-04-12 23:00 PDT (Sunday).
    // If the helper uses SITE_TZ correctly, MO will NOT include this occurrence.
    const weekly: EventInput = {
      ...baseOneOff,
      id: "wtz1",
      startTime: new Date("2026-04-13T06:00:00.000Z"), // Sunday in PDT
      endTime: new Date("2026-04-13T07:00:00.000Z"),
      recurrenceFreq: "weekly",
      recurrenceByWeekday: "SU",
    };
    const out = expandEvents(
      [weekly],
      new Date("2026-04-13T00:00:00.000Z"),
      new Date("2026-04-14T00:00:00.000Z")
    );
    expect(out).toHaveLength(1);
  });

  it("weekly without byWeekday recurs on the start-time's local weekday", () => {
    // 2026-04-15T19:00:00.000Z is Wednesday 12:00 PDT.
    const weekly: EventInput = {
      ...baseOneOff,
      id: "wfb1",
      startTime: new Date("2026-04-15T19:00:00.000Z"),
      endTime: new Date("2026-04-15T20:00:00.000Z"),
      recurrenceFreq: "weekly",
      recurrenceByWeekday: null,
    };
    const out = expandEvents(
      [weekly],
      new Date("2026-04-15T00:00:00.000Z"),
      new Date("2026-04-30T00:00:00.000Z")
    );
    // 4/15, 4/22, 4/29 — three Wednesdays
    expect(out.map((o) => o.occurrenceStart.toISOString())).toEqual([
      "2026-04-15T19:00:00.000Z",
      "2026-04-22T19:00:00.000Z",
      "2026-04-29T19:00:00.000Z",
    ]);
  });

  it("daily recurrenceInterval > 1 skips days", () => {
    const daily: EventInput = {
      ...baseOneOff,
      id: "di1",
      recurrenceFreq: "daily",
      recurrenceInterval: 2,
    };
    const out = expandEvents(
      [daily],
      new Date("2026-04-16T00:00:00.000Z"),
      new Date("2026-04-23T00:00:00.000Z")
    );
    // 4/16, 4/18, 4/20, 4/22 — four occurrences at interval 2
    expect(out).toHaveLength(4);
  });
  describe("keeps the Santa Cruz wall-clock time across DST", () => {
    // Fri Jan 9 2026, 1:30 PM PST (21:30Z). In April, 1:30 PM PDT is 20:30Z.
    const jummah: EventInput = {
      ...baseOneOff,
      id: "j1",
      startTime: new Date("2026-01-09T21:30:00.000Z"),
      endTime: new Date("2026-01-09T22:30:00.000Z"),
    };
    const april = [new Date("2026-04-01T07:00:00.000Z"), new Date("2026-04-15T07:00:00.000Z")] as const;

    it("weekly", () => {
      const out = expandEvents(
        [{ ...jummah, recurrenceFreq: "weekly", recurrenceByWeekday: "FR" }],
        ...april
      );
      expect(out.map((o) => o.occurrenceStart.toISOString())).toEqual([
        "2026-04-03T20:30:00.000Z",
        "2026-04-10T20:30:00.000Z",
      ]);
    });

    it("daily", () => {
      const out = expandEvents([{ ...jummah, recurrenceFreq: "daily" }], ...april);
      expect(out[0].occurrenceStart.toISOString()).toBe("2026-04-01T20:30:00.000Z");
      expect(out).toHaveLength(14);
    });

    it("monthly", () => {
      const out = expandEvents([{ ...jummah, recurrenceFreq: "monthly" }], ...april);
      expect(out.map((o) => o.occurrenceStart.toISOString())).toEqual([
        "2026-04-09T20:30:00.000Z",
      ]);
    });

    it("yearly (Nov 1 2026 is PST, Nov 1 2027 is still PDT)", () => {
      const out = expandEvents(
        [{
          ...baseOneOff,
          id: "y2",
          startTime: new Date("2026-11-01T18:00:00.000Z"), // 10:00 PST
          endTime: new Date("2026-11-01T19:00:00.000Z"),
          recurrenceFreq: "yearly",
        }],
        new Date("2026-10-01T00:00:00.000Z"),
        new Date("2027-12-01T00:00:00.000Z")
      );
      expect(out.map((o) => o.occurrenceStart.toISOString())).toEqual([
        "2026-11-01T18:00:00.000Z",
        "2027-11-01T17:00:00.000Z",
      ]);
    });
  });

  it("biweekly with several weekdays counts whole Sunday-to-Saturday weeks", () => {
    // Starts Wed Apr 1 2026 (week of Sun Mar 29); every 2 weeks on MO,WE.
    const out = expandEvents(
      [{
        ...baseOneOff,
        id: "bw1",
        startTime: new Date("2026-04-02T01:00:00.000Z"), // Wed Apr 1, 18:00 PDT
        endTime: new Date("2026-04-02T02:00:00.000Z"),
        recurrenceFreq: "weekly",
        recurrenceByWeekday: "MO,WE",
        recurrenceInterval: 2,
      }],
      new Date("2026-04-01T07:00:00.000Z"),
      new Date("2026-05-01T07:00:00.000Z")
    );
    expect(out.map((o) => o.occurrenceStart.toISOString().slice(0, 10))).toEqual([
      "2026-04-02", // Wed Apr 1 local
      "2026-04-14", // Mon Apr 13
      "2026-04-16", // Wed Apr 15
      "2026-04-28", // Mon Apr 27
      "2026-04-30", // Wed Apr 29
    ]);
  });

  it("finds occurrences of an event that began years before the range", () => {
    const out = expandEvents(
      [{
        ...baseOneOff,
        id: "old1",
        startTime: new Date("2020-01-06T21:00:00.000Z"), // Mon 13:00 PST
        endTime: new Date("2020-01-06T22:00:00.000Z"),
        recurrenceFreq: "daily",
      }],
      new Date("2026-04-16T07:00:00.000Z"),
      new Date("2026-04-17T07:00:00.000Z")
    );
    expect(out.map((o) => o.occurrenceStart.toISOString())).toEqual([
      "2026-04-16T20:00:00.000Z",
    ]);
  });

  it("includes an occurrence that started the day before and runs into the range", () => {
    const out = expandEvents(
      [{
        ...baseOneOff,
        id: "late1",
        startTime: new Date("2026-04-01T06:00:00.000Z"), // Mar 31, 23:00 PDT
        endTime: new Date("2026-04-01T09:00:00.000Z"), // 3 hours
        recurrenceFreq: "daily",
      }],
      new Date("2026-04-10T07:30:00.000Z"), // Apr 10, 00:30 PDT
      new Date("2026-04-10T08:00:00.000Z")
    );
    expect(out.map((o) => o.occurrenceStart.toISOString())).toEqual([
      "2026-04-10T06:00:00.000Z",
    ]);
  });
});
