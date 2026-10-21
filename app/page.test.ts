import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/upcoming-events", () => ({ UpcomingEvents: () => null }));
vi.mock("@/components/past-events", () => ({ PastEvents: () => null }));

describe("landing page", () => {
  it("revalidates so Upcoming is not frozen at the last deploy", async () => {
    const mod = await import("./page");
    expect(typeof mod.revalidate).toBe("number");
    expect(mod.revalidate).toBeGreaterThan(0);
    expect(mod.revalidate).toBeLessThanOrEqual(900);
    // Importing the whole page module (fonts, date-fns-tz) can pass 5s on a
    // loaded machine.
  }, 20_000);

  it("has no intro sentence, a short meta description, and Past events under Upcoming", async () => {
    const mod = await import("./page");
    expect(mod.metadata.description).toBe(
      "Events and prayer times from the Muslim Student Association at UC Santa Cruz.",
    );
    const { renderToStaticMarkup } = await import("react-dom/server");
    const html = renderToStaticMarkup(mod.default());
    expect(html).not.toMatch(/halaqas|iftars|Friday Jummah/);
    expect(html.indexOf(">Upcoming<")).toBeGreaterThan(-1);
    expect(html.indexOf(">Past events<")).toBeGreaterThan(html.indexOf(">Upcoming<"));
  }, 20_000);
});
