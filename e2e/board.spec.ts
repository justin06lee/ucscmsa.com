import { test, expect, type Page } from "@playwright/test";
import { pickDate, santaCruzDay, seed, signIn, typeTime } from "./fixtures";

// The board's pages under /admin: the Playbook and the Timeline planner.
// Relies on scripts/seed-local.ts (the default Playbook and a few admins).

test.beforeEach(async ({ context, baseURL }) => {
  test.skip(!seed(), "needs the seeded session tokens (E2E_SEED_FILE)");
  await signIn(context, baseURL!, "admin");
});

test("a draft event stays off the public site", async ({ page }) => {
  const day = santaCruzDay(20);
  await page.goto("/admin/events/new?draft=1");
  await expect(page.getByRole("heading", { name: "Plan an event" })).toBeVisible();
  await page.getByRole("textbox", { name: "Title", exact: true }).fill("E2E Iftar Planning");
  await pickDate(page, "Start date", day.label);
  await typeTime(page, "Start time", "6:00 PM");
  await pickDate(page, "End date", day.label);
  await typeTime(page, "End time", "8:00 PM");
  await expect(page.getByLabel(/^Draft/).filter({ visible: true })).toBeChecked();
  await page.getByRole("button", { name: "Create event" }).click();
  await page.waitForURL(/\/admin$/);

  const link = page.getByRole("link", { name: /E2E Iftar Planning/ }).first();
  const id = (await link.getAttribute("href"))!.split("/").filter(Boolean).at(-2)!;
  const res = await page.request.get(`/calendar/events/${id}`);
  expect(res.status()).toBe(404);
  expect(await (await page.request.get("/sitemap.xml")).text()).not.toContain(id);
});

test("the Playbook: categories, numbered steps, and form links in a new tab", async ({ page }) => {
  await page.goto("/admin/playbook");
  await expect(page.getByRole("heading", { name: "Playbook", level: 1 })).toBeVisible();
  const names = ["Event proposal", "Reserve a room", "Get funding", "Purchase orders & receipts", "Promote the event", "After the event"];
  for (const n of names) await expect(page.getByRole("link", { name: new RegExp(n) })).toBeVisible();

  await page.getByRole("link", { name: /Get funding/ }).click();
  await page.waitForURL(/\/admin\/playbook\/get-funding$/);
  await expect(page.getByRole("heading", { name: "Get funding", level: 1 })).toBeVisible();
  const steps = page.getByTestId("playbook-step");
  await expect(steps).toHaveCount(4);
  await expect(steps.first()).toContainText("File the Event Proposal first");
  for (const a of await page.locator('main a[href^="http"]').all()) {
    await expect(a).toHaveAttribute("target", "_blank");
    await expect(a).toHaveAttribute("rel", /noopener/);
  }
  await page.getByRole("link", { name: "All categories" }).click();
  await page.waitForURL(/\/admin\/playbook$/);
});

test("edit mode: add a category, add and move steps, edit text, remove", async ({ page }) => {
  await page.goto("/admin/playbook");
  await page.getByRole("link", { name: "Edit", exact: true }).click();
  await page.waitForURL(/\?edit=1$/);
  await page.getByLabel("Name", { exact: true }).last().fill("E2E Lost and found");
  await page.getByLabel("One line about it").last().fill("What to do with things left behind.");
  await page.getByRole("button", { name: "Add category" }).click();
  const row = page.getByTestId("category-edit-row").filter({ has: page.locator('input[value="E2E Lost and found"]') });
  await expect(row).toHaveCount(1);

  // Move it up one; it trades places with After the event.
  await row.getByRole("button", { name: "Move up" }).click();
  const inputs = page.getByTestId("category-edit-row").locator("input[id^=name-]");
  await expect(inputs.nth(-2)).toHaveValue("E2E Lost and found");
  await page.getByRole("link", { name: "Done", exact: true }).click();
  await page.waitForURL(/\/admin\/playbook$/);
  await page.getByRole("link", { name: /E2E Lost and found/ }).click();
  await page.waitForURL(/\/admin\/playbook\/[a-z0-9-]+$/);
  const slugPath = new URL(page.url()).pathname;

  // Steps: add two, move the second up, then edit one.
  await page.getByRole("link", { name: "Edit", exact: true }).click();
  for (const t of ["Check the lost and found box", "Post it in the group chat"]) {
    await page.getByRole("button", { name: "Add a step" }).click();
    await page.getByLabel("Title", { exact: true }).fill(t);
    await page.getByLabel("Instructions", { exact: true }).fill("Plain words.\n- one\n- two");
    await page.getByRole("button", { name: "Add step" }).click();
    await expect(page.getByTestId("step-edit-row").filter({ hasText: t })).toHaveCount(1);
  }
  const rows = page.getByTestId("step-edit-row");
  await rows.nth(1).getByRole("button", { name: "Move up" }).click();
  await expect(rows.first()).toContainText("Post it in the group chat");
  await rows.first().getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Post it on WhatsApp");
  await page.getByLabel("Days before the event").fill("-1");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(rows.first()).toContainText("Post it on WhatsApp");

  await page.getByRole("link", { name: "Done", exact: true }).click();
  await page.waitForURL(new RegExp(`${slugPath}$`));
  const steps = page.getByTestId("playbook-step");
  await expect(steps).toHaveCount(2);
  await expect(steps.first()).toContainText("Post it on WhatsApp");
  await expect(steps.first().getByRole("listitem")).toHaveCount(2);

  // Remove the category: it leaves the list and waits under Removed categories.
  await page.goto("/admin/playbook?edit=1");
  await row.getByRole("button", { name: "Remove" }).click();
  await expect(row).toHaveCount(0);
  const removed = page.getByRole("heading", { name: "Removed categories" }).locator("..");
  await expect(removed).toContainText("E2E Lost and found");
  await page.goto("/admin/playbook");
  await expect(page.getByRole("link", { name: /E2E Lost and found/ })).toHaveCount(0);
});

/**
 * Visible controls under `min` px on their smaller side. Links in running text
 * are exempt (WCAG 2.5.8's inline exception), as in a guide's list items.
 */
function smallTargets(page: Page, min: number) {
  return page.evaluate((min) => {
    const out: string[] = [];
    const sel = "a[href], button, input:not([type=hidden]), select, textarea, [role=tab], summary";
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const b = el.getBoundingClientRect();
      if (b.width <= 1 || b.height <= 1 || getComputedStyle(el).visibility === "hidden") continue;
      const li = el.closest("li");
      const inline = el.closest("p") || (li && li.textContent!.trim() !== el.textContent!.trim());
      if (el.tagName === "A" && inline) continue;
      if (el.hasAttribute("data-dense-target")) continue;
      if (Math.min(b.width, b.height) < min) {
        const name = (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 30);
        out.push(`${name} (${Math.round(b.width)}×${Math.round(b.height)})`);
      }
    }
    return out;
  }, min);
}

const BOARD_PAGES = [
  "/admin/plan",
  "/admin/playbook",
  "/admin/playbook?edit=1",
  "/admin/playbook/get-funding",
  "/admin/playbook/get-funding?edit=1",
  "/admin/events/new?draft=1",
];

for (const width of [375, 390, 768] as const) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 844 }, isMobile: width < 768, hasTouch: true });

    for (const path of BOARD_PAGES) {
      test(`${path}: no sideways scroll, touch-sized controls`, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        expect(new URL(page.url()).pathname).toBe(path.split("?")[0]);
        // Against the configured width, not innerWidth (see mobile.spec.ts).
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(scrollWidth, "page scrolls sideways").toBeLessThanOrEqual(width);
        expect(await smallTargets(page, 44), "under 44px").toEqual([]);
      });
    }
  });
}
