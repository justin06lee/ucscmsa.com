import { describe, expect, it } from "vitest";
import { render, within } from "@testing-library/react";
import { DayView } from "./day-view";
import { DayAgenda, buildAgenda } from "./day-agenda";
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
    timing: "timed",
    links: [],
    cover: null,
    imageCount: 0,
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
    const { container } = render(
      <DayView
        ymd="2026-10-23"
        occurrences={[occ("hike", "Night Hike", "2026-10-23", "20:30", "22:00")]}
        prayer={OCT_23}
      />
    );
    const { getByText } = within(container.querySelector(".day-grid") as HTMLElement);
    expect(getByText("Night Hike")).toBeInTheDocument();
    const labels = [...container.querySelectorAll(".day-grid__hour")].map((el) => el.textContent);
    expect(labels[0]).toBe("6 AM");
    expect(labels.at(-1)).toBe("9 PM"); // grid runs to 10 PM, the hike's end
    const link = getByText("Night Hike").closest("a")!;
    // 20:30 is 14.5 hours after the 6 AM start, at 56px an hour.
    expect(link.style.top).toBe(`${14.5 * 56}px`);
  });

  it("stretches the grid up for an event before Fajr", () => {
    const { container } = render(
      <DayView
        ymd="2026-10-23"
        occurrences={[occ("tahajjud", "Tahajjud", "2026-10-23", "04:30", "05:30")]}
        prayer={OCT_23}
      />
    );
    const { getByText } = within(container.querySelector(".day-grid") as HTMLElement);
    expect(getByText("Tahajjud")).toBeInTheDocument();
    expect(container.querySelector(".day-grid__hour")?.textContent).toBe("4 AM");
  });

  it("puts overlapping events side by side so neither hides the other", () => {
    const { container } = render(
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
    const { getByText } = within(container.querySelector(".day-grid") as HTMLElement);
    const jummah = getByText("Jummah Prayer").closest("a")!;
    const ball = getByText("Brothers' Basketball").closest("a")!;
    const later = getByText("Asr Study").closest("a")!;
    expect(jummah.dataset.lane).toBe("1/2");
    expect(ball.dataset.lane).toBe("2/2");
    // A later, non-overlapping event keeps the full width.
    expect(later.dataset.lane).toBe("1/1");
  });
});

describe("DayAgenda (phones)", () => {
  const day = [
    occ("hike", "Night Hike", "2026-10-23", "20:30", "22:00"),
    occ("ball", "Brothers' Basketball", "2026-10-23", "13:30", "15:00"),
    occ("qiyam", "Qiyam al-Layl", "2026-10-23", "05:00", "05:50"),
    occ("jummah", "Jummah Prayer", "2026-10-23", "13:15", "14:00"),
  ];
  const order = (items: ReturnType<typeof buildAgenda>) =>
    items.map((i) => (i.kind === "event" ? i.occurrence.title : i.kind === "prayer" ? i.label : "now"));

  it("interleaves every event with the six prayer markers in time order", () => {
    expect(order(buildAgenda("2026-10-23", day, OCT_23))).toEqual([
      "Qiyam al-Layl", // before Fajr: kept, listed first
      "Fajr",
      "Sunrise",
      "Dhuhr",
      "Jummah Prayer", // overlapping pair: both listed
      "Brothers' Basketball",
      "Asr",
      "Maghrib",
      "Isha",
      "Night Hike", // after Isha: kept, listed last
    ]);
  });

  it("places the now line among them and a marker before an event at the same minute", () => {
    const items = buildAgenda("2026-10-23", [occ("x", "At Asr", "2026-10-23", "15:56", "16:30")], OCT_23, 15 * 60 + 56);
    expect(order(items).slice(3, 6)).toEqual(["Asr", "now", "At Asr"]);
  });

  it("renders 12-hour prayer times and each event's time range", () => {
    const { container, getByText } = render(<DayAgenda ymd="2026-10-23" occurrences={day} prayer={OCT_23} />);
    const isha = container.querySelector('[data-prayer="isha"]');
    expect(isha?.textContent).toBe("Isha 7:33 PM");
    expect(getByText("1:15 – 2:00 PM")).toBeInTheDocument();
    expect(getByText("8:30 – 10:00 PM")).toBeInTheDocument();
    expect(getByText("Night Hike").closest("a")?.getAttribute("href")).toContain("/calendar/events/hike?occurrence=");
  });

  it("still lists prayer times on a day with no events", () => {
    const { container, getByText } = render(<DayAgenda ymd="2026-10-23" occurrences={[]} prayer={OCT_23} />);
    expect(getByText("No events scheduled")).toBeInTheDocument();
    expect(container.querySelectorAll(".day-agenda__prayer")).toHaveLength(6);
  });
});
