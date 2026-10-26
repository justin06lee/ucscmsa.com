import { test, expect, type Page } from "@playwright/test";
import { pickDate, santaCruzDay, seed, signIn, typeTime } from "./fixtures";

// The board's pages under /admin: Planning and the Playbook. Relies on
// scripts/seed-local.ts (a planned draft, ev-bonfire, and the seeded guides).

test.beforeEach(async ({ context, baseURL }) => {
  test.skip(!seed(), "needs the seeded session tokens (E2E_SEED_FILE)");
  await signIn(context, baseURL!, "admin");
});

test("plan a draft: tags make a dated checklist; tick and assign tasks", async ({ page }) => {
  // 20 days out: funding (21 days before) is already overdue, the room (14) isn't.
  const day = santaCruzDay(20);
  await page.goto("/admin/events/new?draft=1");
  await expect(page.getByRole("heading", { name: "Plan an event" })).toBeVisible();
  await page.getByRole("textbox", { name: "Title", exact: true }).fill("E2E Iftar Planning");
  await pickDate(page, "Start date", day.label);
  await typeTime(page, "Start time", "6:00 PM");
  await pickDate(page, "End date", day.label);
  await typeTime(page, "End time", "8:00 PM");
  await expect(page.getByLabel(/^Draft/).filter({ visible: true })).toBeChecked();
  const needs = page.getByRole("group", { name: "It needs" });
  for (const tag of ["Room", "Food", "Funding"]) await needs.getByText(tag, { exact: true }).click();
  await page.getByRole("button", { name: "Create event" }).click();

  await page.waitForURL(/\/admin\/plan\/[0-9A-Z]{26}$/);
  const id = page.url().split("/").pop()!;
  await expect(page.getByRole("heading", { name: "E2E Iftar Planning" })).toBeVisible();
  const checklist = page.getByRole("list", { name: "Checklist" });
  await expect(checklist.getByRole("listitem", { name: "Today" })).toBeVisible();
  for (const t of ["Apply for funding", "Book a room (after filing the proposal)", "Submit the Purchase Request (DocuSign)", "Post on Instagram, WhatsApp and the site", "Post a reminder"]) {
    await expect(checklist.getByText(t, { exact: true })).toBeVisible();
  }
  const funding = checklist.locator("[data-state]").filter({ hasText: "Apply for funding" });
  await expect(funding).toHaveAttribute("data-state", "overdue");
  await expect(funding).toContainText("Overdue");
  await expect(page.getByText("0 of 9 done · 3 overdue")).toBeVisible();

  // Tick a task: it stays ticked, says who did it, and the count moves.
  await checklist.getByText("Book a room (after filing the proposal)", { exact: true }).click();
  const room = checklist.locator("[data-state]").filter({ hasText: "Book a room" });
  await expect(room).toHaveAttribute("data-state", "done");
  await expect(room).toContainText(/Done by/);

  // Assign one.
  await page.getByLabel('Who\'s doing "Submit the Purchase Request (DocuSign)"').selectOption({ label: "Maryam Siddiqui" });
  await expect(page.getByLabel('Who\'s doing "Submit the Purchase Request (DocuSign)"')).toBeEnabled();

  await page.reload();
  await expect(checklist.locator("[data-state]").filter({ hasText: "Book a room" })).toHaveAttribute("data-state", "done");
  await expect(page.getByLabel('Who\'s doing "Submit the Purchase Request (DocuSign)"')).toHaveValue(/.+/);
  await expect(page.getByLabel('Who\'s doing "Submit the Purchase Request (DocuSign)"').locator("option:checked")).toHaveText(
    "Maryam Siddiqui"
  );
  await expect(page.getByText("1 of 9 done · 3 overdue")).toBeVisible();

  // The overview lists it with its next step.
  await page.goto("/admin/plan");
  await expect(page.getByRole("link", { name: /E2E Iftar Planning/ })).toBeVisible();

  // A draft stays off the public site.
  const res = await page.request.get(`/calendar/events/${id}`);
  expect(res.status()).toBe(404);
  expect(await (await page.request.get("/sitemap.xml")).text()).not.toContain(id);
});

test("edit a guide, then restore the earlier version", async ({ page }) => {
  await page.goto("/admin/playbook/promotion");
  await expect(page.getByRole("heading", { name: "Promote the event" })).toBeVisible();
  await page.getByRole("link", { name: /Edit/ }).click();

  const body = page.getByRole("textbox", { name: "Guide text", exact: true });
  await body.fill("E2E edited step with a ");
  await body.press("End");
  await page.getByRole("button", { name: "Link", exact: true }).click();
  await page.getByLabel("Link label").fill("link");
  await page.getByLabel("Web address").fill("https://example.com");
  await page.getByRole("button", { name: "Save link", exact: true }).click();
  await expect(body.getByRole("link", { name: "link", exact: true })).toHaveAttribute("rel", /noopener/);
  await page.getByRole("button", { name: "Save" }).click();

  await page.waitForURL(/\/admin\/playbook\/promotion$/);
  await expect(page.getByText("E2E edited step")).toBeVisible();
  await expect(page.getByText(/Last edited by/)).toBeVisible();

  await page.goto("/admin/playbook/promotion/edit");
  await page.getByRole("button", { name: "Restore" }).first().click();
  await page.waitForURL(/\/admin\/playbook\/promotion$/);
  await expect(page.getByText("E2E edited step")).toHaveCount(0);
  await expect(page.getByText("1 day before:")).toBeVisible();
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
  "/admin/plan/ev-bonfire",
  "/admin/playbook",
  "/admin/playbook/book-a-room",
  "/admin/playbook/book-a-room/edit",
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
