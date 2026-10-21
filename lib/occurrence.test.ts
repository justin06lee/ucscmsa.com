import { describe, expect, it } from "vitest";
import { resolveOccurrence } from "./occurrence";
import type { EventInput } from "./rrule-lite";
import { formatLocal, parseHMInLocal } from "./time";

const jummah: EventInput = {
  id: "jummah",
  title: "Jummah Prayer",
  description: "",
  location: "",
  startTime: parseHMInLocal("2026-09-25", "13:15"),
  endTime: parseHMInLocal("2026-09-25", "14:00"),
  recurrenceFreq: "weekly",
  recurrenceByWeekday: "FR",
  recurrenceInterval: 1,
  recurrenceUntil: parseHMInLocal("2026-12-11", "23:59"),
  cancellations: [],
};

// Tue Oct 20 2026, 1 PM in Santa Cruz.
const NOW = parseHMInLocal("2026-10-20", "13:00");
const local = (d: Date) => formatLocal(d, "yyyy-MM-dd HH:mm");

describe("resolveOccurrence", () => {
  it("shows the next upcoming occurrence of a series, not its first-ever date", () => {
    const r = resolveOccurrence(jummah, undefined, NOW);
    expect(local(r.start)).toBe("2026-10-23 13:15");
    expect(local(r.end)).toBe("2026-10-23 14:00");
  });

  it("uses ?occurrence= when it is a real occurrence", () => {
    const iso = parseHMInLocal("2026-10-30", "13:15").toISOString();
    expect(local(resolveOccurrence(jummah, iso, NOW).start)).toBe("2026-10-30 13:15");
  });

  it("ignores a malformed ?occurrence= instead of crashing", () => {
    expect(local(resolveOccurrence(jummah, "not-a-date", NOW).start)).toBe("2026-10-23 13:15");
  });

  it("ignores a ?occurrence= the series never hits", () => {
    const wednesday = parseHMInLocal("2026-10-21", "13:15").toISOString();
    expect(local(resolveOccurrence(jummah, wednesday, NOW).start)).toBe("2026-10-23 13:15");
  });

  it("skips a cancelled occurrence", () => {
    const ev = { ...jummah, cancellations: ["2026-10-23"] };
    expect(local(resolveOccurrence(ev, undefined, NOW).start)).toBe("2026-10-30 13:15");
    const cancelled = parseHMInLocal("2026-10-23", "13:15").toISOString();
    expect(local(resolveOccurrence(ev, cancelled, NOW).start)).toBe("2026-10-30 13:15");
  });

  it("falls back to the last occurrence once a series has ended", () => {
    const after = parseHMInLocal("2027-01-05", "12:00");
    // Date only: the time-of-day across DST is a separate open question.
    expect(formatLocal(resolveOccurrence(jummah, undefined, after).start, "yyyy-MM-dd")).toBe(
      "2026-12-11",
    );
  });

  it("keeps a one-off event's own date, past or future", () => {
    const gbm: EventInput = {
      ...jummah,
      id: "gbm",
      startTime: parseHMInLocal("2026-10-01", "18:30"),
      endTime: parseHMInLocal("2026-10-01", "20:00"),
      recurrenceFreq: null,
      recurrenceByWeekday: null,
      recurrenceUntil: null,
    };
    expect(local(resolveOccurrence(gbm, undefined, NOW).start)).toBe("2026-10-01 18:30");
    expect(local(resolveOccurrence(gbm, "garbage", NOW).start)).toBe("2026-10-01 18:30");
  });
});
