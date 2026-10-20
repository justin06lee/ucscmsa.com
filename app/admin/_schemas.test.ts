import { describe, expect, it } from "vitest";
import { eventInputSchema } from "./_schemas";

const valid = {
  title: "Jummah",
  description: "",
  location: "Stevenson Event Center",
  startDate: "2026-10-23",
  startTime: "13:30",
  endDate: "2026-10-23",
  endTime: "14:30",
  recurrenceFreq: "none",
  recurrenceByWeekday: "",
  recurrenceInterval: "1",
  recurrenceUntil: "",
};

const errorFor = (input: Record<string, unknown>) => {
  const r = eventInputSchema.safeParse(input);
  return r.success ? null : r.error.issues[0]?.message;
};

describe("eventInputSchema", () => {
  it("accepts a normal event", () => {
    expect(errorFor(valid)).toBeNull();
    expect(errorFor({ ...valid, recurrenceFreq: "weekly", recurrenceByWeekday: "MO,WE,FR" })).toBeNull();
  });

  it("rejects dates that match YYYY-MM-DD but don't exist or are absurd", () => {
    expect(errorFor({ ...valid, startDate: "2026-02-31", endDate: "2026-03-01" })).toBe("Invalid date");
    expect(errorFor({ ...valid, startDate: "2026-13-01" })).toBe("Invalid date");
    expect(errorFor({ ...valid, startDate: "0001-01-01" })).toBe("Invalid date");
    expect(errorFor({ ...valid, recurrenceFreq: "daily", recurrenceUntil: "2026-02-30" })).toBe("Invalid date");
  });

  it("rejects impossible times", () => {
    expect(errorFor({ ...valid, startTime: "99:99" })).toBe("Invalid start time");
    expect(errorFor({ ...valid, endTime: "24:00" })).toBe("Invalid end time");
  });

  it("rejects an end before the start even when recurring dates are left blank", () => {
    expect(
      errorFor({ ...valid, recurrenceFreq: "weekly", startDate: "", endDate: "", startTime: "22:00", endTime: "01:00" })
    ).toBe("End must be after start");
  });

  it("caps field sizes and recurrence values", () => {
    expect(errorFor({ ...valid, title: "x".repeat(201) })).toBe("Title is too long");
    expect(errorFor({ ...valid, title: "   " })).toBe("Title required");
    expect(errorFor({ ...valid, description: "x".repeat(10_001) })).toBe("Description is too long");
    expect(errorFor({ ...valid, recurrenceFreq: "weekly", recurrenceByWeekday: "MO,XX" })).toBe("Invalid weekdays");
    expect(errorFor({ ...valid, recurrenceInterval: "1000" })).not.toBeNull();
  });
});
