import { describe, expect, it } from "vitest";
import { parseCalendarDate } from "./calendar-date";
import { toLocalYmd } from "./time";

describe("parseCalendarDate", () => {
  // 12:30 PM in Santa Cruz; only the identity of the fallback matters.
  const now = new Date("2026-06-15T19:30:00.000Z");

  it("keeps a real date at UTC noon", () => {
    expect(parseCalendarDate("2026-11-10", now).toISOString()).toBe("2026-11-10T12:00:00.000Z");
  });

  it("renders the requested day in the site time zone", () => {
    expect(toLocalYmd(parseCalendarDate("2026-03-01", now))).toBe("2026-03-01");
    expect(toLocalYmd(parseCalendarDate("2026-11-01", now))).toBe("2026-11-01");
  });

  it.each([
    "2026-13-01",
    "9999-99-99",
    "2026-02-31",
    "0001-01-01",
    "2026-1-1",
    "01/01/2026",
    "yesterday",
    "",
  ])("falls back to today for %j", (bad) => {
    expect(parseCalendarDate(bad, now)).toBe(now);
  });

  it("falls back to today when the parameter is missing", () => {
    expect(parseCalendarDate(undefined, now)).toBe(now);
  });
});
