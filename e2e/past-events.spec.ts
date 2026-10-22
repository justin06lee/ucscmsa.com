import { test, expect, type Page } from "@playwright/test";

// Past events (scripts/seed-local.ts seeds ~50 one-off events in the year
// before the seed ran, ev-past-01 being two days back): the landing's Past
// events list, the passed state on event pages, and the phone month list's
// "Earlier this month".

const TZ = "America/Los_Angeles";
const todayYmd = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });

async function eventStart(page: Page): Promise<number> {
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  const ev = ld.map((s) => JSON.parse(s)).find((d) => d["@type"] === "Event");
  return new Date(ev.startDate).getTime();
}

test("the landing lists recent past events, newest first, after Upcoming", async ({ page }) => {
  await page.goto("/");
  const upcoming = page.getByRole("heading", { name: "Upcoming" });
  const past = page.getByRole("heading", { name: "Past events" });
  await expect(past).toBeVisible();
  expect((await past.boundingBox())!.y).toBeGreaterThan((await upcoming.boundingBox())!.y);

  const section = page.getByRole("region", { name: "Past events" });
  await expect(section.getByRole("link", { name: "Browse the calendar →" })).toHaveAttribute("href", "/calendar?view=year");
  const hrefs = await section.getByRole("listitem").getByRole("link").evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
  expect(hrefs).toHaveLength(4);

  // Each is over, shown as such, and they run newest first.
  const starts: number[] = [];
  for (const href of hrefs) {
    await page.goto(href);
    await expect(page.getByRole("status").filter({ hasText: "This event has passed." })).toBeVisible();
    starts.push(await eventStart(page));
  }
  expect(starts.every((t) => t < Date.now())).toBe(true);
  expect([...starts].sort((a, b) => b - a)).toEqual(starts);
});

test("a past event says so and offers no RSVP; an upcoming one still does", async ({ page }) => {
  await page.goto("/calendar/events/ev-past-01");
  await expect(page.getByRole("status")).toHaveText("This event has passed.");
  await expect(page.getByRole("heading", { name: "RSVP" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Sign in with UCSC to RSVP/ })).toHaveCount(0);

  await page.goto("/calendar/events/ev-potluck");
  await expect(page.getByText("This event has passed.")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "RSVP" })).toBeVisible();
});

test("a past date of a weekly event points to the next one", async ({ page }) => {
  // A Weekly Halaqa occurrence (Wed Oct 7, 7:30 PM) before the seed's "today" (Oct 2026).
  await page.goto("/calendar/events/ev-halaqa?occurrence=2026-10-08T02:30:00.000Z");
  const status = page.getByRole("status");
  await expect(status).toContainText("This event has passed.");
  await expect(status.getByRole("link", { name: /^Next: / })).toHaveAttribute("href", "/calendar/events/ev-halaqa");
  await expect(page.getByRole("heading", { name: "RSVP" })).toHaveCount(0);
});

test.describe("phone month list", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("past days of the current month fold under Earlier this month", async ({ page }) => {
    const today = todayYmd();
    test.skip(Number(today.slice(8)) <= 2, "the seed's newest past event is two days back");
    await page.goto("/calendar?view=month");
    const month = new Date(`${today}T12:00:00`).toLocaleDateString("en-US", { month: "long" });
    const list = page.getByRole("region", { name: `${month} events` });
    const earlier = list.locator("details.month-agenda__earlier");
    await expect(earlier).toHaveCount(1);
    await expect(earlier).not.toHaveAttribute("open");

    // The open list starts today or later; the folded one holds only earlier days.
    const day = (href: string | null) => href!.match(/date=(\d{4}-\d{2}-\d{2})/)![1];
    const dayLinks = (scope: ReturnType<typeof list.locator>) =>
      scope.locator("h3 a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    const visible = await dayLinks(list.locator(":scope > ol"));
    expect(visible.every((h) => day(h) >= today)).toBe(true);
    await earlier.locator("summary").tap();
    await expect(earlier).toHaveAttribute("open", "");
    const folded = await dayLinks(earlier);
    expect(folded.length).toBeGreaterThan(0);
    expect(folded.every((h) => day(h) < today)).toBe(true);
  });

  test("an earlier month lists every day, with nothing folded", async ({ page }) => {
    const d = new Date(Date.now() - 62 * 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", { timeZone: TZ });
    await page.goto(`/calendar?view=month&date=${d}`);
    await expect(page.locator("details.month-agenda__earlier")).toHaveCount(0);
    const month = new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "long" });
    await expect(page.getByRole("region", { name: `${month} events` }).getByRole("link").first()).toBeVisible();
  });
});
