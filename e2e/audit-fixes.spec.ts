import { test, expect, type Locator } from "@playwright/test";

// Regression tests for the 2026-10-20 UI audit. They rely on the fixtures in
// scripts/seed-local.ts (ev-gbm, ev-jummah, and the Fri Oct 23 2026 events),
// which playwright.config.ts seeds before starting the server.

// Playwright's toBeVisible() treats opacity:0 as visible, so check it directly.
function effectiveOpacity(l: Locator) {
  return l.evaluate((el) => {
    let o = 1;
    for (let n: Element | null = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
    return o;
  });
}

test.describe("with prefers-reduced-motion: reduce", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("event page content is not left at opacity 0", async ({ page }) => {
    await page.goto("/calendar/events/ev-gbm");
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
    const h1 = page.getByRole("heading", { level: 1, name: "Fall General Body Meeting" });
    expect(await effectiveOpacity(h1)).toBe(1);
  });

  test("calendar month grid is not left at opacity 0", async ({ page }) => {
    await page.goto("/calendar?view=month&date=2026-10-20");
    await page.waitForLoadState("networkidle");
    const cell = page.getByRole("link", { name: /^Thursday, October 22, / });
    expect(await effectiveOpacity(cell)).toBe(1);
  });
});

test("event content is in the server HTML at full opacity, not waiting on hydration", async ({ request }) => {
  const html = await (await request.get("/calendar/events/ev-gbm")).text();
  expect(html).toContain("Fall General Body Meeting");
  expect(html).not.toMatch(/style="opacity:\s*0/);
});

test("recurring event page shows an upcoming date, not the series' first one", async ({ page }) => {
  await page.goto("/calendar/events/ev-jummah");
  await expect(page.getByRole("heading", { level: 1, name: "Jummah Prayer" })).toBeVisible();
  await expect(page.getByText("Friday, September 25, 2026")).toHaveCount(0);
  await expect(page.locator("main")).toContainText(/Friday, \w+ \d{1,2}, 20\d\d/);
});

test("a malformed ?occurrence= still renders the event", async ({ page }) => {
  const res = await page.goto("/calendar/events/ev-jummah?occurrence=not-a-date");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Jummah Prayer" })).toBeVisible();
});

test("day view shows events after Isha and side by side when they overlap", async ({ page }) => {
  await page.goto("/calendar?view=day&date=2026-10-23");
  await expect(page.getByRole("link", { name: /Night Hike to the Lookout/ })).toBeVisible();
  const jummah = await page.getByRole("link", { name: /Jummah Prayer/ }).boundingBox();
  const ball = await page.getByRole("link", { name: /Brothers' Basketball/ }).boundingBox();
  expect(jummah && ball).toBeTruthy();
  const [left, right] = jummah!.x < ball!.x ? [jummah!, ball!] : [ball!, jummah!];
  expect(left.x + left.width).toBeLessThanOrEqual(right.x);
});
