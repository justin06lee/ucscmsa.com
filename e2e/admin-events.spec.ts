import { test, expect, type Page } from "@playwright/test";
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
  await row.getByRole("button", { name: "Cancel Hilltop Potluck" }).click();
  await expect(row).toContainText("Cancelled"); // the request is still held
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && !!r.request().headers()["next-action"]);
  release();
  await saved;
  await expect(row.getByRole("button", { name: "Uncancel Hilltop Potluck" })).toBeVisible();
  await page.unrouteAll({ behavior: "wait" });
  await page.reload();
  await expect(row).toContainText("Cancelled");

  await onActions(page, "fail");
  await row.getByRole("button", { name: "Uncancel Hilltop Potluck" }).click();
  await expect(row.getByRole("status")).toContainText("Nothing was changed");
  await expect(row).toContainText("Cancelled");
  await page.unrouteAll({ behavior: "wait" });

  const undone = page.waitForResponse((r) => r.request().method() === "POST" && !!r.request().headers()["next-action"]);
  await row.getByRole("button", { name: "Uncancel Hilltop Potluck" }).click();
  await undone;
  await expect(row.getByRole("status")).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Cancel Hilltop Potluck" })).toBeVisible();
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
  await row.getByRole("button", { name: "Delete E2E Throwaway" }).click();
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(row.getByRole("status")).toContainText("Nothing was changed");
  await page.unrouteAll({ behavior: "wait" });

  await row.getByRole("button", { name: "Delete E2E Throwaway" }).click();
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".admin-event").filter({ hasText: "E2E Throwaway" })).toHaveCount(0);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test("rows fit the screen and every action is touch-sized", async ({ page }) => {
    await page.goto("/admin");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    for (const el of await page.locator(".admin-event").first().locator("a, button").all()) {
      expect((await el.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    for (const el of await page.getByRole("tab").all()) expect((await el.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
});
