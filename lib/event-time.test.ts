import { describe, expect, it } from "vitest";
import { eventInstants } from "./event-rules";
import { occurrenceWhen, startTimeText, timeOnDay, TIME_NOT_ANNOUNCED, untimedOnDay } from "./event-time";

// Occurrences stored the way the admin form and the import store them.
function when(p: Parameters<typeof eventInstants>[0]) {
  const { timing, startTime, endTime } = eventInstants(p);
  return { occurrenceStart: startTime, occurrenceEnd: endTime, timing };
}

const timed = when({ date: "2026-10-23", startTime: "18:00", endTime: "20:00" });
const startOnly = when({ date: "2026-10-23", startTime: "18:00" });
const dateOnly = when({ date: "2026-10-24" });
const weekend = when({ date: "2026-11-13", endDate: "2026-11-15" });

describe("startTimeText", () => {
  it("gives the start, or nothing when only the date is known", () => {
    expect(startTimeText(timed.occurrenceStart, "timed")).toBe("6:00 PM");
    expect(startTimeText(startOnly.occurrenceStart, "start_only")).toBe("6:00 PM");
    expect(startTimeText(dateOnly.occurrenceStart, "date_only")).toBeNull();
  });
});

describe("timeOnDay", () => {
  it("shows a range only when both times are known", () => {
    expect(timeOnDay(timed, "2026-10-23")).toBe("6:00 – 8:00 PM");
    expect(timeOnDay(startOnly, "2026-10-23")).toBe("6:00 PM");
  });

  it("says a date-only event's time wasn't announced, never midnight", () => {
    expect(timeOnDay(dateOnly, "2026-10-24")).toBe(TIME_NOT_ANNOUNCED);
    expect(timeOnDay(weekend, "2026-11-14")).toBe(TIME_NOT_ANNOUNCED);
  });

  it("keeps the onward/until wording for timed events across midnight", () => {
    const late = when({ date: "2026-10-23", endDate: "2026-10-24", startTime: "22:00", endTime: "01:00" });
    expect(timeOnDay(late, "2026-10-23")).toBe("10:00 PM onward");
    expect(timeOnDay(late, "2026-10-24")).toBe("Until 1:00 AM");
  });
});

describe("untimedOnDay", () => {
  it("is true for date-only days and the later days of a start-only event", () => {
    expect(untimedOnDay(dateOnly, "2026-10-24")).toBe(true);
    expect(untimedOnDay(timed, "2026-10-23")).toBe(false);
    expect(untimedOnDay(startOnly, "2026-10-23")).toBe(false);
    const camp = when({ date: "2026-10-23", endDate: "2026-10-25", startTime: "17:00" });
    expect(untimedOnDay(camp, "2026-10-24")).toBe(true);
    expect(timeOnDay(camp, "2026-10-24")).toBe("Continues");
  });
});

describe("occurrenceWhen", () => {
  it("gives a timed event its date and full range", () => {
    expect(occurrenceWhen(timed)).toEqual({ date: "Friday, October 23, 2026", time: "6:00 – 8:00 PM" });
  });

  it("says when a start-only event starts and claims no end", () => {
    expect(occurrenceWhen(startOnly)).toEqual({ date: "Friday, October 23, 2026", time: "Starts 6:00 PM" });
  });

  it("says a date-only event's time wasn't announced", () => {
    expect(occurrenceWhen(dateOnly)).toEqual({ date: "Saturday, October 24, 2026", time: TIME_NOT_ANNOUNCED });
  });

  it("names both days of a multi-day event", () => {
    expect(occurrenceWhen(weekend)).toEqual({ date: "Fri, Nov 13 – Sun, Nov 15, 2026", time: TIME_NOT_ANNOUNCED });
    const newYear = when({ date: "2026-12-31", endDate: "2027-01-01", startTime: "20:00", endTime: "01:00" });
    expect(occurrenceWhen(newYear)).toEqual({
      date: "Thu, Dec 31, 2026 – Fri, Jan 1, 2027",
      time: "Thu 8:00 PM – Fri 1:00 AM",
    });
  });
});
