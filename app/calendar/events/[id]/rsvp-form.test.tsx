import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const rsvp = vi.fn();
vi.mock("@/app/calendar/_actions", () => ({ rsvp: (fd: FormData) => rsvp(fd), clearRsvp: vi.fn() }));

const { RsvpForm } = await import("./rsvp-form");

describe("RsvpForm errors", () => {
  it.each([
    ["event_ended", "This event has ended, so it no longer takes RSVPs."],
    ["login_required", "Please sign in first."],
    ["invalid_input", "Something went wrong."],
  ])("shows %s in words", async (code, text) => {
    rsvp.mockResolvedValueOnce({ ok: false, error: code });
    render(<RsvpForm eventId="ev-1" occurrenceStart="2026-10-23T01:00:00.000Z" current={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Going" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
    expect(rsvp.mock.lastCall?.[0].get("status")).toBe("yes");
  });
});
