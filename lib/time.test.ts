import { describe, expect, it } from "vitest";
import {
  SITE_TZ,
  toLocalYmd,
  parseHMInLocal,
  floorLocalHour,
  ceilLocalHour,
  startOfLocalDayUtc,
  endOfLocalDayUtc,
  startOfLocalMonthUtc,
  endOfLocalMonthUtc,
  startOfLocalYearUtc,
  endOfLocalYearUtc,
  monthGridDays,
} from "./time";

describe("time helpers", () => {
  it("SITE_TZ is America/Los_Angeles", () => {
    expect(SITE_TZ).toBe("America/Los_Angeles");
  });

  it("toLocalYmd returns YYYY-MM-DD in Santa Cruz tz", () => {
    // 2026-04-16T07:00:00Z is 2026-04-16 00:00 PDT
    expect(toLocalYmd(new Date("2026-04-16T07:00:00Z"))).toBe("2026-04-16");
    // 2026-04-16T06:59:00Z is 2026-04-15 23:59 PDT
    expect(toLocalYmd(new Date("2026-04-16T06:59:00Z"))).toBe("2026-04-15");
  });

  it("parseHMInLocal combines a date and HH:mm string into a UTC Date", () => {
    const d = parseHMInLocal("2026-04-16", "05:18");
    // 05:18 PDT on 2026-04-16 = 12:18 UTC
    expect(d.toISOString()).toBe("2026-04-16T12:18:00.000Z");
  });

  it("floorLocalHour returns local-hour integer", () => {
    // 05:18 PDT
    const d = new Date("2026-04-16T12:18:00.000Z");
    expect(floorLocalHour(d)).toBe(5);
  });

  it("ceilLocalHour rounds up when minutes > 0", () => {
    // 20:47 PDT on 2026-04-16 = 03:47 UTC 2026-04-17
    const d = new Date("2026-04-17T03:47:00.000Z");
    expect(ceilLocalHour(d)).toBe(21);
  });

  it("ceilLocalHour returns the exact hour when minutes == 0", () => {
    const d = new Date("2026-04-17T02:00:00.000Z"); // 19:00 PDT
    expect(ceilLocalHour(d)).toBe(19);
  });

  it("startOfLocalDayUtc returns UTC for local midnight", () => {
    const d = startOfLocalDayUtc("2026-04-16");
    expect(d.toISOString()).toBe("2026-04-16T07:00:00.000Z");
  });

  it("endOfLocalDayUtc returns UTC for local 23:59:59.999", () => {
    const d = endOfLocalDayUtc("2026-04-16");
    expect(d.toISOString()).toBe("2026-04-17T06:59:59.999Z");
  });

  it("startOfLocalMonthUtc returns UTC for local month start (April 2026 is PDT)", () => {
    const d = startOfLocalMonthUtc("2026-04-16");
    expect(d.toISOString()).toBe("2026-04-01T07:00:00.000Z");
  });

  it("endOfLocalMonthUtc returns UTC for next-month-start - 1ms (April 2026 is PDT)", () => {
    const d = endOfLocalMonthUtc("2026-04-16");
    expect(d.toISOString()).toBe("2026-05-01T06:59:59.999Z");
  });

  it("startOfLocalYearUtc returns UTC for local Jan 1 (January is PST)", () => {
    const d = startOfLocalYearUtc("2026-04-16");
    expect(d.toISOString()).toBe("2026-01-01T08:00:00.000Z");
  });

  it("endOfLocalYearUtc returns UTC for next-year-start - 1ms", () => {
    const d = endOfLocalYearUtc("2026-04-16");
    expect(d.toISOString()).toBe("2027-01-01T07:59:59.999Z");
  });

  it("monthGridDays trims trailing out-of-month weeks for April 2026 (30 days, Wed start)", () => {
    const grid = monthGridDays("2026-04-16");
    // April 2026: Apr 1 is a Wednesday, so the grid starts Sun Mar 29. The last
    // row of the standard 6-week grid would be all May, so it's dropped, leaving 35.
    expect(grid).toHaveLength(35);
    expect(grid[0].ymd).toBe("2026-03-29");
    expect(grid[0].inMonth).toBe(false);
    expect(grid[3].ymd).toBe("2026-04-01");
    expect(grid[3].inMonth).toBe(true);
    // April has 30 days; index 3 + 29 = 32 is April 30.
    expect(grid[32].ymd).toBe("2026-04-30");
    expect(grid[32].inMonth).toBe(true);
    expect(grid[33].ymd).toBe("2026-05-01");
    expect(grid[33].inMonth).toBe(false);
    expect(grid[34].ymd).toBe("2026-05-02");
  });

  it("monthGridDays returns 42 cells when last week contains in-month days (May 2026)", () => {
    const grid = monthGridDays("2026-05-16");
    // May 2026: May 1 is Friday. Last week (index 35-41) is May 31 through Jun 6.
    expect(grid).toHaveLength(42);
    expect(grid[35].ymd).toBe("2026-05-31");
    expect(grid[35].inMonth).toBe(true);
    expect(grid[41].ymd).toBe("2026-06-06");
    expect(grid[41].inMonth).toBe(false);
  });

  it("monthGridDays trims multiple trailing weeks (February 2026 starts Sunday, 28 days)", () => {
    const grid = monthGridDays("2026-02-10");
    // Feb 2026: Feb 1 is Sunday, 28 days → exactly 4 full weeks in month, no spillover needed.
    expect(grid).toHaveLength(28);
    expect(grid[0].ymd).toBe("2026-02-01");
    expect(grid[0].inMonth).toBe(true);
    expect(grid[27].ymd).toBe("2026-02-28");
    expect(grid[27].inMonth).toBe(true);
  });
});
