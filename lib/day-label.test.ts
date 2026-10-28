import { describe, expect, it } from "vitest";
import { dayText, nextYmd, relativeDay } from "./day-label";

// Santa Cruz is UTC-7 in late October (PDT) and UTC-8 from November 1 (PST).
describe("nextYmd", () => {
  it("rolls over month and year ends", () => {
    expect(nextYmd("2026-10-27")).toBe("2026-10-28");
    expect(nextYmd("2026-10-31")).toBe("2026-11-01");
    expect(nextYmd("2026-12-31")).toBe("2027-01-01");
    expect(nextYmd("2028-02-28")).toBe("2028-02-29");
  });
});

describe("relativeDay", () => {
  it("says Today for any time on the local day", () => {
    expect(relativeDay(new Date("2026-10-27T07:00:00Z"), "2026-10-27")).toBe("Today"); // 12:00 AM
    expect(relativeDay(new Date("2026-10-28T06:59:00Z"), "2026-10-27")).toBe("Today"); // 11:59 PM
  });

  it("says Tomorrow for the next local day, even when UTC has moved on", () => {
    expect(relativeDay(new Date("2026-10-28T07:00:00Z"), "2026-10-27")).toBe("Tomorrow");
    expect(relativeDay(new Date("2026-10-29T03:00:00Z"), "2026-10-27")).toBe("Tomorrow"); // 8 PM on the 28th
  });

  it("gives nothing for yesterday or two days out", () => {
    expect(relativeDay(new Date("2026-10-27T06:59:00Z"), "2026-10-27")).toBeNull(); // 11:59 PM on the 26th
    expect(relativeDay(new Date("2026-10-29T07:00:00Z"), "2026-10-27")).toBeNull();
  });

  it("knows tomorrow across the change back to standard time", () => {
    expect(relativeDay(new Date("2026-11-01T20:00:00Z"), "2026-10-31")).toBe("Tomorrow"); // 12 PM PST
  });
});

describe("dayText", () => {
  it("keeps the date when it is neither today nor tomorrow", () => {
    expect(dayText(new Date("2026-10-31T23:00:00Z"), "2026-10-27")).toBe("Sat, Oct 31");
    expect(dayText(new Date("2026-10-31T23:00:00Z"), "2026-10-27", "MMM d, yyyy")).toBe("Oct 31, 2026");
  });

  it("uses the word when it is", () => {
    expect(dayText(new Date("2026-10-28T02:20:00Z"), "2026-10-27")).toBe("Today");
    expect(dayText(new Date("2026-10-28T23:00:00Z"), "2026-10-27")).toBe("Tomorrow");
  });
});
