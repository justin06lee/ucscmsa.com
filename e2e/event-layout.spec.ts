import { test, expect, type Locator, type Page } from "@playwright/test";

// The Luma-style event displays (fixtures from scripts/seed-local.ts):
// cover-first Upcoming cards, list cards with covers, the timeline lists, the
// two-column event page, and the cover for events without a flyer.

const HENNA = "/calendar/events/ev-date-only"; // three flyers, a form link, date-only, upcoming
const POTLUCK = "/calendar/events/ev-potluck"; // no flyer

const upcoming = (page: Page) =>
  page.locator("section", { has: page.getByRole("heading", { name: "Upcoming", exact: true }) }).locator(".upcoming-card");

/** A cover shows its flyer whole (contained, not cropped) or the fallback. */
async function expectCover(card: Locator) {
  const img = card.locator("img").first();
  if (await img.count()) {
    expect(await img.evaluate((el) => getComputedStyle(el).objectFit)).toBe("contain");
  } else {
    await expect(card.locator("[data-fallback-cover]")).toHaveCount(1);
  }
}

test.describe("Upcoming cards", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("each is its cover, a date line and the title, the whole card one link", async ({ page }) => {
    await page.goto("/");
    const cards = upcoming(page);
    expect(await cards.count()).toBeGreaterThan(0);
    for (const card of await cards.all()) {
      await expectCover(card);
      await expect(card.locator("a:not([data-link-kind]) > span").nth(1)).toHaveText(/^\w{3}, \w{3} \d{1,2} · /);
      // One link to the event; any other link is the event's RSVP button.
      const eventLinks = card.locator("a:not([data-link-kind])");
      await expect(eventLinks).toHaveCount(1);
      await expect(eventLinks).toHaveAttribute("href", /^\/calendar\/events\/[^/?]+\?occurrence=/);
    }
    // The cover opens the event too: the card is one link.
    const first = cards.first();
    const href = await first.locator("a:not([data-link-kind])").getAttribute("href");
    const box = (await first.locator(".aspect-\\[4\\/5\\]").boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForURL((url) => url.pathname + url.search === href);
  });

  // The RSVP button on a card is in components/upcoming-events.test.tsx: the
  // seed's event with a form isn't always among the next three.
  test("a card's RSVP button, when there is one, opens the form in a new tab", async ({ page }) => {
    await page.goto("/");
    for (const rsvp of await upcoming(page).locator("a[data-link-kind]").all()) {
      await expect(rsvp).toHaveAttribute("target", "_blank");
      await expect(rsvp).toHaveAccessibleName(/\(opens in a new tab\)$/);
      expect(await rsvp.evaluate((a) => a.parentElement!.closest("a"))).toBeNull();
    }
  });

  test("past events are list cards with covers, newest first", async ({ page }) => {
    await page.goto("/");
    const items = page.getByRole("region", { name: "Past events" }).locator("li");
    await expect(items).toHaveCount(4);
    for (const item of await items.all()) await expectCover(item);
  });
});

test.describe("phones", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("Upcoming cards stack, each flyer the full width", async ({ page }) => {
    await page.goto("/");
    const cover = (await upcoming(page).first().locator(".aspect-\\[4\\/5\\]").boundingBox())!;
    expect(cover.width).toBeGreaterThan(330);
    expect(Math.abs(cover.height - (cover.width * 5) / 4)).toBeLessThan(1.5);
  });

  test("the event page stacks: the cover, then the title and RSVP", async ({ page }) => {
    await page.goto(HENNA);
    const cover = (await page.getByRole("button", { name: /^Open full screen/ }).boundingBox())!;
    const title = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
    expect(cover.y + cover.height).toBeLessThanOrEqual(title.y);
    expect(cover.x + cover.width).toBeLessThanOrEqual(390);
  });

  test("the month list is a timeline of days, with list cards", async ({ page }) => {
    await page.goto("/calendar?view=month&date=2026-10-20");
    const list = page.getByRole("region", { name: "October events" });
    const days = list.locator(":scope > ol.timeline > li.timeline__day");
    await expect(days.first()).toBeVisible();
    expect(await days.count()).toBeGreaterThan(1);
    const card = list.locator(".event-list-card").filter({ hasText: "Night Hike to the Lookout" });
    await expect(card).toContainText("8:30");
    await expectCover(card);
  });
});

test.describe("event page", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("the cover sits on the left, the details and RSVP on the right", async ({ page }) => {
    await page.goto(HENNA);
    const cover = (await page.getByRole("button", { name: /^Open full screen/ }).boundingBox())!;
    const title = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
    const rsvp = (await page.getByRole("region", { name: "RSVP" }).boundingBox())!;
    expect(cover.x + cover.width).toBeLessThan(title.x);
    expect(title.y).toBeLessThan(cover.y + cover.height);
    expect(rsvp.x).toBeGreaterThanOrEqual(title.x);
    await expect(page.getByText("Time not announced")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to the calendar" })).toHaveAttribute("href", "/calendar");
  });

  test("an event without a flyer gets the fallback cover, which says nothing to screen readers", async ({ page }) => {
    await page.goto(POTLUCK);
    const fallback = page.locator("[data-fallback-cover]");
    await expect(fallback).toBeVisible();
    await expect(fallback).toHaveAttribute("aria-hidden", "true");
    await expect(fallback).toContainText("Community Potluck");
    // Type on a tone, never a shape or a pattern (no svg, no image in the background).
    await expect(page.locator("[data-fallback-cover] svg")).toHaveCount(0);
    expect(await fallback.evaluate((el) => getComputedStyle(el).backgroundImage)).not.toContain("url(");
    const box = (await fallback.boundingBox())!;
    const title = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
    expect(box.x + box.width).toBeLessThan(title.x);
  });
});
