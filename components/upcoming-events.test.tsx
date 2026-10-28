import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { Occurrence } from "@/lib/rrule-lite";
import type { EventImage } from "@/lib/event-image";
import { parseHMInLocal } from "@/lib/time";
import { UpcomingEvents } from "./upcoming-events";

const upcoming = vi.hoisted(() => ({ items: [] as Occurrence[] }));
vi.mock("@/lib/db/queries", () => ({ getUpcomingOccurrences: async () => upcoming.items }));

const flyer = (url: string): EventImage => ({
  id: "abc",
  w: 1080,
  h: 1350,
  origin: "import",
  card: { url: `${url}-card.webp`, w: 480, h: 600 },
  page: { url: `${url}-page.webp`, w: 1200, h: 1500 },
  full: { url: `${url}-full.webp`, w: 2000, h: 2500 },
});

function occ(id: string, title: string, extra: Partial<Occurrence> = {}): Occurrence {
  return {
    eventId: id,
    title,
    description: "",
    location: "Cowell College",
    occurrenceStart: parseHMInLocal("2026-10-21", "18:00"),
    occurrenceEnd: parseHMInLocal("2026-10-21", "20:00"),
    timing: "timed",
    links: [],
    cover: null,
    imageCount: 0,
    ...extra,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Upcoming cards", () => {
  it("shows the whole flyer, a date line and the title, as one link; a form gets an RSVP button beside it", async () => {
    upcoming.items = [
      occ("game", "Sisters' Game Night", {
        cover: flyer("https://blob.example/game"),
        imageCount: 1,
        links: [{ kind: "rsvp", label: "RSVP", url: "https://forms.gle/game" }],
      }),
      occ("pie", "Pie Your Board", {
        cover: flyer("https://blob.example/pie"),
        imageCount: 1,
        links: [{ kind: "donate", label: "Donate", url: "https://example.org/pie" }],
      }),
      occ("henna", "Henna Tabling", { timing: "date_only" }),
    ];
    const { container } = render(await UpcomingEvents({ limit: 3 }));
    const cards = [...container.querySelectorAll(".upcoming-card")] as HTMLElement[];
    expect(cards).toHaveLength(3);

    // The card is one link to the occurrence: cover, date line, title.
    const game = within(cards[0]);
    const link = game.getByRole("link", { name: /Sisters' Game Night/ });
    expect(link.getAttribute("href")).toMatch(/^\/calendar\/events\/game\?occurrence=/);
    expect(link).toHaveTextContent("Wed, Oct 21 · 6:00 PM");
    const img = link.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("https://blob.example/game-card.webp");
    expect(img.className).toContain("object-contain");
    expect(img.getAttribute("loading")).toBe("lazy");

    // Its RSVP form: the site's primary button, a new tab, outside the card link.
    const rsvp = game.getByRole("link", { name: "RSVP (opens in a new tab)" });
    expect(rsvp).toHaveAttribute("href", "https://forms.gle/game");
    expect(rsvp).toHaveAttribute("target", "_blank");
    expect(rsvp).toHaveAttribute("rel", "noopener noreferrer nofollow ugc");
    expect(rsvp.className).toContain("bg-ink");
    expect(link.contains(rsvp)).toBe(false);

    // A donate link is no RSVP: no button on the card.
    expect(within(cards[1]).getAllByRole("link")).toHaveLength(1);

    // No flyer: the fallback cover, hidden from screen readers; no made-up time.
    const henna = cards[2];
    expect(henna.querySelector("[data-fallback-cover]")).toHaveAttribute("aria-hidden", "true");
    // Type on a tone, never a shape or a pattern.
    expect(henna.querySelector("[data-fallback-cover] svg")).toBeNull();
    expect(henna.querySelector("[data-fallback-cover]")).toHaveTextContent("Henna Tabling");
    expect(henna).toHaveTextContent("Time not announced");
    expect(screen.getAllByRole("link", { name: /Henna Tabling/ })).toHaveLength(1);
  });

  it("puts the title first, then the day and time, then the place; today and tomorrow say so", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-27T19:00:00Z")); // noon, Tue Oct 27, in Santa Cruz
    upcoming.items = [
      occ("skills", "Brothers Life Skills", {
        location: "C9 Community Room",
        occurrenceStart: parseHMInLocal("2026-10-27", "19:20"),
        occurrenceEnd: parseHMInLocal("2026-10-27", "21:00"),
      }),
      occ("halaqa", "Halaqa", { occurrenceStart: parseHMInLocal("2026-10-28", "18:00") }),
      occ("night", "Bright Night", { occurrenceStart: parseHMInLocal("2026-10-31", "16:00") }),
    ];
    const { container } = render(await UpcomingEvents({ limit: 3 }));
    const [skills, halaqa, night] = [...container.querySelectorAll(".upcoming-card a")] as HTMLElement[];
    const text = skills.textContent ?? "";
    expect(text.indexOf("Brothers Life Skills")).toBeLessThan(text.indexOf("Today · 7:20 PM"));
    expect(text.indexOf("Today · 7:20 PM")).toBeLessThan(text.indexOf("C9 Community Room"));
    expect(halaqa).toHaveTextContent("Tomorrow · 6:00 PM");
    expect(night).toHaveTextContent("Sat, Oct 31 · 4:00 PM");
  });

  it("says so when there are no events", async () => {
    upcoming.items = [];
    render(await UpcomingEvents({}));
    expect(screen.getByText("No events scheduled yet. Check back soon.")).toBeInTheDocument();
  });
});
