import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/upcoming-events", () => ({ UpcomingEvents: () => null }));

describe("landing page", () => {
  it("revalidates so Upcoming is not frozen at the last deploy", async () => {
    const mod = await import("./page");
    expect(typeof mod.revalidate).toBe("number");
    expect(mod.revalidate).toBeGreaterThan(0);
    expect(mod.revalidate).toBeLessThanOrEqual(900);
  });
});
