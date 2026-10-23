import { test, expect, type Locator, type Page } from "@playwright/test";
import { adminRow, pickDate, santaCruzDay, seed, signIn, typeTime } from "./fixtures";

// The admin Events page (app/admin/events-list.tsx) on scripts/seed-local.ts
// data. Quick actions change the seed, so each test puts back what it changed
// (Hilltop Potluck, ev-past-start-only, is used by no other spec).

test.beforeEach(async ({ context, baseURL }) => {
  test.skip(!seed(), "needs the seeded session tokens (E2E_SEED_FILE)");
  await signIn(context, baseURL!, "admin");
});

const days = (page: Page) =>
  page.locator(".timeline__day").evaluateAll((els) => els.map((e) => e.getAttribute("data-day")!));

/** Open a row's "More" menu and pick an item. */
async function chooseFromMore(row: Locator, title: string, item: string | RegExp) {
  await row.getByRole("button", { name: `More actions for ${title}` }).click();
  await row.getByRole("menuitem", { name: item }).click();
}

/** Hold (or fail) the page's Server Function calls; the rest of the traffic passes. */
async function onActions(page: Page, handle: "hold" | "fail") {
  let release = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.route("**/admin**", async (route) => {
    const req = route.request();
    if (req.method() !== "POST" || !req.headers()["next-action"]) return route.continue();
    if (handle === "fail") return route.abort();
    await held;
    await route.continue();
  });
  return release;
}

test("upcoming soonest first, past newest first, and a series once with its pattern", async ({ page }) => {
  await page.goto("/admin");
  const up = await days(page);
  expect(up.length).toBeGreaterThan(2);
  expect([...up].sort()).toEqual(up);
  const halaqa = page.locator(".admin-event").filter({ hasText: "Weekly Halaqa" });
  await expect(halaqa).toHaveCount(1);
  await expect(halaqa).toContainText("Repeats · Wednesdays");

  await page.getByRole("tab", { name: /^Past/ }).click();
  await expect(page).toHaveURL(/\?tab=past$/);
  const past = await days(page);
  expect(past.length).toBeGreaterThan(2);
  expect([...past].sort().reverse()).toEqual(past);
  expect(past[0] <= up[0]).toBe(true);
});

test("search by title or place and filter, at once, kept in the URL", async ({ page }) => {
  await page.goto("/admin");
  const search = page.getByRole("searchbox", { name: "Search events" });
  await search.fill("oakes college");
  await expect(page.locator(".admin-event").filter({ hasText: "Community Potluck" })).toBeVisible();
  await expect(page.locator(".admin-event").filter({ hasText: "Fall General Body Meeting" })).toHaveCount(0);
  await expect(page).toHaveURL(/q=oakes\+college/);
  await search.fill("");

  const drafts = page.getByRole("button", { name: "Drafts", exact: true });
  await drafts.click();
  await expect(drafts).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".admin-event").filter({ hasText: "Fall Bonfire Night" })).toBeVisible();
  for (const row of await page.locator(".admin-event").all()) await expect(row).toContainText("Draft");
  await page.reload();
  await expect(drafts).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Cancelled", exact: true }).click();
  await expect(page.locator(".admin-event").filter({ hasText: "Beach Cleanup at Natural Bridges" })).toContainText("Cancelled");
});

test("cancel shows at once, before the server answers; a failed save rolls back with a quiet line", async ({ page }) => {
  const row = await adminRow(page, "Hilltop Potluck");
  await expect(row).not.toContainText("Cancelled");

  const release = await onActions(page, "hold");
  await chooseFromMore(row, "Hilltop Potluck", "Cancel event");
  await expect(row).toContainText("Cancelled"); // the request is still held
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && !!r.request().headers()["next-action"]);
  release();
  await saved;
  await row.getByRole("button", { name: "More actions for Hilltop Potluck" }).click();
  await expect(row.getByRole("menuitem", { name: "Uncancel event" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.unrouteAll({ behavior: "wait" });
  await page.reload();
  await expect(row).toContainText("Cancelled");

  await onActions(page, "fail");
  await chooseFromMore(row, "Hilltop Potluck", "Uncancel event");
  await expect(row.getByRole("status")).toContainText("Nothing was changed");
  await expect(row).toContainText("Cancelled");
  await page.unrouteAll({ behavior: "wait" });

  const undone = page.waitForResponse((r) => r.request().method() === "POST" && !!r.request().headers()["next-action"]);
  await chooseFromMore(row, "Hilltop Potluck", "Uncancel event");
  await undone;
  await expect(row.getByRole("status")).toHaveCount(0);
  await row.getByRole("button", { name: "More actions for Hilltop Potluck" }).click();
  await expect(row.getByRole("menuitem", { name: "Cancel event" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(row).not.toContainText("Cancelled");
});

test("delete asks first, comes back if the server fails, and otherwise goes for good", async ({ page }) => {
  const day = santaCruzDay(30);
  await page.goto("/admin/events/new");
  await page.getByLabel("Title", { exact: true }).fill("E2E Throwaway");
  await pickDate(page, "Start date", day.label);
  await typeTime(page, "Start time", "6:00 PM");
  await pickDate(page, "End date", day.label);
  await typeTime(page, "End time", "7:00 PM");
  await page.getByRole("button", { name: "Create event" }).click();
  await page.waitForURL(/\/admin$/);

  const row = await adminRow(page, "E2E Throwaway");
  await onActions(page, "fail");
  await chooseFromMore(row, "E2E Throwaway", /^Delete/);
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(row.getByRole("status")).toContainText("Nothing was changed");
  await page.unrouteAll({ behavior: "wait" });

  await chooseFromMore(row, "E2E Throwaway", /^Delete/);
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".admin-event").filter({ hasText: "E2E Throwaway" })).toHaveCount(0);
});

test("the More menu: Edit and View stay out, keyboard and outside click work", async ({ page }) => {
  const row = await adminRow(page, "Hilltop Potluck");
  await expect(row.getByRole("link", { name: /^Edit / })).toBeVisible();
  await expect(row.getByRole("button", { name: /^Cancel|^Uncancel|^Delete/ })).toHaveCount(0);

  const more = row.getByRole("button", { name: "More actions for Hilltop Potluck" });
  await expect(more).toHaveAttribute("aria-haspopup", "menu");
  await expect(more).toHaveAttribute("aria-expanded", "false");
  expect((await more.boundingBox())!.width).toBeGreaterThanOrEqual(44);

  await more.focus();
  await page.keyboard.press("Enter");
  await expect(more).toHaveAttribute("aria-expanded", "true");
  const items = row.getByRole("menuitem");
  await expect(items).toHaveCount(2);
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(items.last()).toBeFocused();
  await page.keyboard.press("ArrowDown"); // wraps
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(row.getByRole("menu")).toHaveCount(0);
  await expect(more).toBeFocused();

  await page.keyboard.press("Space");
  await expect(row.getByRole("menu")).toBeVisible();
  await page.getByRole("heading", { level: 1 }).click();
  await expect(row.getByRole("menu")).toHaveCount(0);

  // Delete in the menu only asks; nothing is deleted.
  await more.click();
  await row.getByRole("menuitem", { name: /^Delete/ }).click();
  await expect(row.getByRole("group", { name: "Delete Hilltop Potluck?" })).toBeVisible();
  await row.getByRole("button", { name: "Keep" }).click();
  await expect(more).toBeVisible();
});

test("row links prefetch on hover or focus, not when they scroll into view", async ({ page }) => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, "Next prefetches only on a production server (next start)");
  const prefetches: string[] = [];
  page.on("request", (r) => {
    if (r.headers()["next-router-prefetch"] || r.headers()["rsc"]) prefetches.push(new URL(r.url()).pathname);
  });
  const row = await adminRow(page, "Hilltop Potluck");
  await page.waitForTimeout(1500);
  expect(prefetches.filter((p) => /^\/admin\/events\/.+\/edit$/.test(p))).toEqual([]);

  const edit = row.getByRole("link", { name: /^Edit / });
  const href = (await edit.getAttribute("href"))!;
  await edit.hover();
  await expect.poll(() => prefetches.includes(href)).toBe(true);
  await edit.click();
  await page.waitForURL(`**${href}`);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test("rows fit the screen and every action is touch-sized", async ({ page }) => {
    await page.goto("/admin");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    for (const el of await page.locator(".admin-event").first().locator("a, button").all()) {
      expect((await el.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    // The More menu opens inside the screen, even on the last row.
    const last = page.locator(".admin-event").last();
    await last.scrollIntoViewIfNeeded();
    await last.getByRole("button", { name: /^More actions for/ }).tap();
    const box = (await last.getByRole("menu").boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(812);
    for (const item of await last.getByRole("menuitem").all()) expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press("Escape");
    for (const el of await page.getByRole("tab").all()) expect((await el.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
});
