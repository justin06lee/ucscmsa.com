import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrayerSpace } from "./prayer-space";

describe("PrayerSpace", () => {
  it("shows the name, where it is, and the optional hours and notes", () => {
    render(
      <PrayerSpace
        info={{ name: "Example Hall, Room 1", where: "Second floor, past the lounge", hours: "8 AM–10 PM" }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Prayer space on campus" })).toBeInTheDocument();
    expect(screen.getByText("Example Hall, Room 1")).toBeInTheDocument();
    expect(screen.getByText("Second floor, past the lounge")).toBeInTheDocument();
    expect(screen.getByText("8 AM–10 PM")).toBeInTheDocument();
  });
});
