import { test, expect } from "@playwright/test";

// URLs in event descriptions are links (components/linkified-text.tsx). The
// seeded Sisters' Circle (scripts/seed-local.ts) carries a Game Night-style
// RSVP link and a long URL that has to wrap on a phone.

const RSVP = "https://forms.gle/thkacLx82yYcgxjt9";

test.describe("event description links at 375px", () => {
  test.use({ viewport: { width: 375, height: 844 }, isMobile: true, hasTouch: true });

  test("an RSVP URL is a safe link, and long URLs wrap", async ({ page }) => {
    await page.goto("/calendar/events/ev-sisters");

    const link = page.getByRole("link", { name: `${RSVP} (opens in a new tab)`, exact: true });
    await expect(link).toHaveCount(1);
    expect(await link.evaluate((a) => a.tagName)).toBe("A");
    await expect(link).toHaveAttribute("href", RSVP);
    await expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow ugc");
    await expect(link).toHaveAttribute("target", "_blank");
    // The sentence's full stop stays outside the link (the new-tab note is
    // screen-reader text inside it).
    await expect(link.locator("xpath=..")).toContainText(`RSVP for the address: ${RSVP} (opens in a new tab).`);

    const long = page.getByRole("link", { name: /^https:\/\/drive\.google\.com\// });
    const box = (await long.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), "page scrolls sideways").toBeLessThanOrEqual(375);

    // Metadata and JSON-LD keep the description as plain text.
    const meta = await page.locator('meta[name="description"]').getAttribute("content");
    expect(meta).toContain("A relaxed space for sisters");
    expect(meta).not.toMatch(/<a|href=/);
    const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
    const event = ld.map((s) => JSON.parse(s)).find((d) => d["@type"] === "Event");
    expect(event.description).toContain(`RSVP for the address: ${RSVP}.`);
  });
});
