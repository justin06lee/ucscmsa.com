import { test, expect, type Page } from "@playwright/test";
import { seed, signIn } from "./fixtures";

// The board's pages under /admin: Planning and the Playbook. Relies on
// scripts/seed-local.ts (a planned draft, ev-bonfire, and the seeded guides).

test.beforeEach(async ({ context, baseURL }) => {
  test.skip(!seed(), "needs the seeded session tokens (E2E_SEED_FILE)");
  await signIn(context, baseURL!, "admin");
});

/** Santa Cruz's date `days` from now, as the date picker labels it and as YYYY-MM-DD. */
function santaCruzDay(days: number) {
  const d = new Date(Date.now() + days * 86_400_000);
  const tz = { timeZone: "America/Los_Angeles" } as const;
  const label = d.toLocaleDateString("en-US", { ...tz, weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const ymd = d.toLocaleDateString("en-CA", tz);
  return { label, ymd };
}

async function pickDate(page: Page, field: string, label: string) {
  await page.getByLabel(new RegExp(`^${field}`)).click();
  const dialog = page.getByRole("dialog", { name: "Choose date" });
  for (let i = 0; i < 3 && !(await dialog.getByRole("gridcell", { name: label }).isVisible()); i++) {
    await dialog.getByRole("button", { name: "Next month" }).click();
  }
  await dialog.getByRole("gridcell", { name: label }).click();
}

async function typeTime(page: Page, field: string, value: string) {
  const input = page.getByRole("textbox", { name: new RegExp(`^${field}`) });
  await input.fill(value);
  await input.press("Enter");
}

test("plan a draft: tags make a dated checklist; tick and assign tasks", async ({ page }) => {
  // 20 days out: funding (21 days before) is already overdue, the room (14) isn't.
  const day = santaCruzDay(20);
  await page.goto("/admin/events/new?draft=1");
  await expect(page.getByRole("heading", { name: "Plan an event" })).toBeVisible();
  await page.getByLabel("Title", { exact: true }).fill("E2E Iftar Planning");
  await pickDate(page, "Start date", day.label);
  await typeTime(page, "Start time", "6:00 PM");
  await pickDate(page, "End date", day.label);
  await typeTime(page, "End time", "8:00 PM");
  await expect(page.getByLabel(/^Draft/)).toBeChecked();
  const needs = page.getByRole("group", { name: "It needs" });
  for (const tag of ["Room", "Food", "Funding"]) await needs.getByText(tag, { exact: true }).click();
  await page.getByRole("button", { name: "Create event" }).click();

  await page.waitForURL(/\/admin\/plan\/[0-9A-Z]{26}$/);
  const id = page.url().split("/").pop()!;
  await expect(page.getByRole("heading", { name: "E2E Iftar Planning" })).toBeVisible();
  const checklist = page.getByRole("list", { name: "Checklist" });
  await expect(checklist.getByRole("listitem", { name: "Today" })).toBeVisible();
  for (const t of ["Apply for funding", "Book a room", "Submit the purchase form", "Post on Instagram and WhatsApp", "Post a reminder"]) {
    await expect(checklist.getByText(t, { exact: true })).toBeVisible();
  }
  const funding = checklist.locator("[data-state]").filter({ hasText: "Apply for funding" });
  await expect(funding).toHaveAttribute("data-state", "overdue");
  await expect(funding).toContainText("Overdue");
  await expect(page.getByText("0 of 5 done · 1 overdue")).toBeVisible();

  // Tick a task: it stays ticked, says who did it, and the count moves.
  await checklist.getByText("Book a room", { exact: true }).click();
  const room = checklist.locator("[data-state]").filter({ hasText: "Book a room" });
  await expect(room).toHaveAttribute("data-state", "done");
  await expect(room).toContainText(/Done by/);

  // Assign one.
  await page.getByLabel('Who\'s doing "Submit the purchase form"').selectOption({ label: "Maryam Siddiqui" });
  await expect(page.getByLabel('Who\'s doing "Submit the purchase form"')).toBeEnabled();

  await page.reload();
  await expect(checklist.locator("[data-state]").filter({ hasText: "Book a room" })).toHaveAttribute("data-state", "done");
  await expect(page.getByLabel('Who\'s doing "Submit the purchase form"')).toHaveValue(/.+/);
  await expect(page.getByLabel('Who\'s doing "Submit the purchase form"').locator("option:checked")).toHaveText(
    "Maryam Siddiqui"
  );
  await expect(page.getByText("1 of 5 done · 1 overdue")).toBeVisible();

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

  const body = page.getByLabel("Guide text, in markdown");
  await body.fill("## Steps\n\n1. E2E edited step with a [link](https://example.com).\n");
  await page.getByRole("tab", { name: "Preview" }).click();
  await expect(page.getByRole("link", { name: "link" })).toHaveAttribute("rel", /noopener/);
  await page.getByRole("button", { name: "Save" }).click();

  await page.waitForURL(/\/admin\/playbook\/promotion$/);
  await expect(page.getByText("E2E edited step")).toBeVisible();
  await expect(page.getByText(/Last edited by/)).toBeVisible();

  await page.goto("/admin/playbook/promotion/edit");
  await page.getByRole("button", { name: "Restore" }).last().click();
  await page.waitForURL(/\/admin\/playbook\/promotion$/);
  await expect(page.getByText("E2E edited step")).toHaveCount(0);
  await expect(page.getByText("Post a reminder.")).toBeVisible();
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
  "/admin/plan/settings",
  "/admin/playbook",
  "/admin/playbook/book-a-room",
  "/admin/playbook/book-a-room/edit",
  "/admin/events/new?draft=1",
];

for (const width of [375, 390, 768] as const) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 844 }, isMobile: width < 768, hasTouch: true });

    test("board pages: no sideways scroll, touch-sized controls", async ({ page }) => {
      for (const path of BOARD_PAGES) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        expect(new URL(page.url()).pathname, path).toBe(path.split("?")[0]);
        // Against the configured width, not innerWidth (see mobile.spec.ts).
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(scrollWidth, `${path} scrolls sideways`).toBeLessThanOrEqual(width);
        expect(await smallTargets(page, 44), `${path}: under 44px`).toEqual([]);
      }
    });
  });
}
