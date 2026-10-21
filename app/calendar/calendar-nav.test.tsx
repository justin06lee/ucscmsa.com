import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams("view=day&date=2026-10-23"),
}));

import { CalendarNav } from "./calendar-nav";

const FRI_OCT_23 = new Date("2026-10-23T12:00:00.000Z");

describe("CalendarNav keyboard shortcuts", () => {
  beforeEach(() => push.mockReset());

  it("ignores single-letter shortcuts while focus is elsewhere on the page (WCAG 2.1.4)", () => {
    render(<CalendarNav view="day" date={FRI_OCT_23} />);
    for (const key of ["t", "d", "m", "y"]) fireEvent.keyDown(window, { key });
    expect(push).not.toHaveBeenCalled();
  });

  it("honours letter shortcuts while focus is in the calendar toolbar", () => {
    render(<CalendarNav view="day" date={FRI_OCT_23} />);
    const monthTab = screen.getByRole("tab", { name: "month" });
    monthTab.focus();
    fireEvent.keyDown(monthTab, { key: "m" });
    expect(push).toHaveBeenCalledWith(expect.stringContaining("view=month"));
  });

  it("keeps arrow-key paging page-wide", () => {
    render(<CalendarNav view="day" date={FRI_OCT_23} />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).toContain("view=day");
  });
});
