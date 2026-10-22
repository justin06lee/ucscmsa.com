import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const rsvp = vi.fn();
vi.mock("@/app/calendar/_actions", () => ({ rsvp: (fd: FormData) => rsvp(fd), clearRsvp: vi.fn() }));

const { RsvpForm } = await import("./rsvp-form");

describe("RsvpForm", () => {
  it.each([
    ["event_ended", "This event has ended, so it no longer takes RSVPs."],
    ["login_required", "Please sign in first."],
    ["invalid_input", "That wasn't valid. Check it and try again."],
  ])("shows %s in words, quietly, and rolls the choice back", async (code, text) => {
    rsvp.mockResolvedValueOnce({ ok: false, error: code });
    render(<RsvpForm eventId="ev-1" occurrenceStart="2026-10-23T01:00:00.000Z" current={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Going" }));
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Going" })).toHaveAttribute("aria-pressed", "false");
    expect(rsvp.mock.lastCall?.[0].get("status")).toBe("yes");
  });

  it("shows the choice at once and says Saving… until the server answers", async () => {
    let answer!: (v: unknown) => void;
    rsvp.mockReturnValueOnce(new Promise((r) => (answer = r)));
    render(<RsvpForm eventId="ev-1" occurrenceStart="2026-10-23T01:00:00.000Z" current={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Maybe" }));
    expect(await screen.findByText("Saving…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Maybe" })).toHaveAttribute("aria-pressed", "true");
    answer({ ok: true });
    await waitFor(() => expect(screen.queryByText("Saving…")).toBeNull());
  });

  it("treats a lost connection as a failure, not a crash", async () => {
    rsvp.mockRejectedValueOnce(new TypeError("fetch failed"));
    render(<RsvpForm eventId="ev-1" occurrenceStart="2026-10-23T01:00:00.000Z" current="no" />);
    fireEvent.click(screen.getByRole("button", { name: "Going" }));
    expect(await screen.findByText(/Couldn't reach the server/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Can't go" })).toHaveAttribute("aria-pressed", "true");
  });
});
