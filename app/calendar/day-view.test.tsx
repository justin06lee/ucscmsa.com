import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { DayView } from "./day-view";
import type { Occurrence } from "@/lib/rrule-lite";
import { parseHMInLocal } from "@/lib/time";

// Santa Cruz, Fri Oct 23 2026 (Aladhan/ISNA).
const OCT_23 = {
  fajr: "06:12",
  sunrise: "07:23",
  dhuhr: "12:52",
  asr: "15:56",
  maghrib: "18:21",
  isha: "19:33",
};

function occ(id: string, title: string, ymd: string, start: string, end: string): Occurrence {
  return {
    eventId: id,
    title,
    description: "",
    location: "",
    occurrenceStart: parseHMInLocal(ymd, start),
    occurrenceEnd: parseHMInLocal(ymd, end),
  };
}

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

  it("stretches the grid to show an event after Isha instead of dropping it", () => {
    const { container, getByText } = render(
      <DayView
        ymd="2026-10-23"
        occurrences={[occ("hike", "Night Hike", "2026-10-23", "20:30", "22:00")]}
        prayer={OCT_23}
      />
    );
    expect(getByText("Night Hike")).toBeInTheDocument();
    const labels = [...container.querySelectorAll(".day-grid__hour")].map((el) => el.textContent);
    expect(labels[0]).toBe("6 AM");
    expect(labels.at(-1)).toBe("9 PM"); // grid runs to 10 PM, the hike's end
    const link = getByText("Night Hike").closest("a")!;
    // 20:30 is 14.5 hours after the 6 AM start, at 56px an hour.
    expect(link.style.top).toBe(`${14.5 * 56}px`);
  });

  it("stretches the grid up for an event before Fajr", () => {
    const { container, getByText } = render(
      <DayView
        ymd="2026-10-23"
        occurrences={[occ("tahajjud", "Tahajjud", "2026-10-23", "04:30", "05:30")]}
        prayer={OCT_23}
      />
    );
    expect(getByText("Tahajjud")).toBeInTheDocument();
    expect(container.querySelector(".day-grid__hour")?.textContent).toBe("4 AM");
  });

  it("puts overlapping events side by side so neither hides the other", () => {
    const { getByText } = render(
      <DayView
        ymd="2026-10-23"
        occurrences={[
          occ("jummah", "Jummah Prayer", "2026-10-23", "13:15", "14:00"),
          occ("ball", "Brothers' Basketball", "2026-10-23", "13:30", "15:00"),
          occ("asr", "Asr Study", "2026-10-23", "16:00", "17:00"),
        ]}
        prayer={OCT_23}
      />
    );
    const jummah = getByText("Jummah Prayer").closest("a")!;
    const ball = getByText("Brothers' Basketball").closest("a")!;
    const later = getByText("Asr Study").closest("a")!;
    expect(jummah.dataset.lane).toBe("1/2");
    expect(ball.dataset.lane).toBe("2/2");
    // A later, non-overlapping event keeps the full width.
    expect(later.dataset.lane).toBe("1/1");
  });
});
