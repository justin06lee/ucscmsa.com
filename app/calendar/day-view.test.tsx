import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { DayView } from "./day-view";

describe("DayView", () => {
  it("renders hour labels from floor(Fajr) to ceil(Isha)", () => {
    const { container } = render(
      <DayView
        ymd="2026-04-16"
        occurrences={[]}
        prayer={{
          fajr: "05:18",
          sunrise: "06:38",
          dhuhr: "13:07",
          asr: "16:45",
          maghrib: "19:35",
          isha: "20:47",
        }}
      />
    );
    const hours = container.querySelectorAll(".day-grid__hour");
    // gridStart=floor(05:18)=5, gridEnd=ceil(20:47)=21, labels span [5, 6, ..., 20] = 16
    expect(hours.length).toBe(16);
  });
});
