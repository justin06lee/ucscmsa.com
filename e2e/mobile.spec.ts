import { test, expect, type Page } from "@playwright/test";
import { seed, signIn } from "./fixtures";

// Every page at phone and tablet widths: nothing scrolls sideways, and every
// control is a usable touch target. Relies on scripts/seed-local.ts fixtures.

const WIDTHS = [375, 390, 768] as const;

// A month the seed's past events fill (scripts/seed-local.ts), three back from today.
const MONTHS_BACK = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", {
  timeZone: "America/Los_Angeles",
});

const PAGES: { name: string; path: string; as?: "admin" | "member" }[] = [
  { name: "landing", path: "/" },
  { name: "calendar month", path: "/calendar?view=month&date=2026-10-20" },
  { name: "calendar day", path: "/calendar?view=day&date=2026-10-23" },
  { name: "calendar year", path: "/calendar?view=year&date=2026-10-20" },
  { name: "event", path: "/calendar/events/ev-gbm" },
  { name: "recurring event", path: "/calendar/events/ev-halaqa" },
  { name: "event with links", path: "/calendar/events/ev-sisters" },
  { name: "past event", path: "/calendar/events/ev-past-01" },
  { name: "event with flyers and links", path: "/calendar/events/ev-panel" },
  { name: "calendar month, 3 back", path: `/calendar?view=month&date=${MONTHS_BACK}` },
  { name: "calendar this month", path: "/calendar?view=month" },
  // Untimed events (seed-local): a date-only one today, start-only, a date-only weekend.
  { name: "calendar today, date-only event", path: "/calendar?view=day" },
  { name: "date-only event", path: "/calendar/events/ev-date-only" },
  { name: "start-only event", path: "/calendar/events/ev-start-only" },
  { name: "date-only weekend", path: "/calendar/events/ev-retreat" },
  { name: "event signed in", path: "/calendar/events/ev-gbm", as: "member" },
  { name: "login", path: "/login" },
  { name: "404", path: "/this-page-does-not-exist" },
  { name: "admin events", path: "/admin", as: "admin" },
  { name: "admin new event", path: "/admin/events/new", as: "admin" },
  { name: "admin edit event", path: "/admin/events/ev-halaqa/edit", as: "admin" },
  { name: "admin edit date-only event", path: "/admin/events/ev-date-only/edit", as: "admin" },
  { name: "admin edit event with flyers and links", path: "/admin/events/ev-panel/edit", as: "admin" },
  { name: "admin admins", path: "/admin/admins", as: "admin" },
  { name: "admin nominations", path: "/admin/nominations", as: "admin" },
  { name: "admin timeline", path: "/admin/plan", as: "admin" },
  // A category's own page is in board.spec.ts: its links sit in list items,
  // which that spec exempts as running text.
  { name: "admin playbook", path: "/admin/playbook", as: "admin" },
];

function mobile(width: number) {
  return { viewport: { width, height: 844 }, isMobile: width < 768, hasTouch: true };
}

/**
 * Visible controls whose smaller side is under `min` px. Exempt: links inside
 * running text (WCAG 2.5.8's inline exception), the visually hidden skip link,
 * and parts marked data-dense-target (year-view day squares from sm up, the
 * halves of the 44px time picker).
 */
function smallTargets(page: Page, min: number, includeDense: boolean) {
  return page.evaluate(
    ({ min, includeDense }) => {
      const out: string[] = [];
      const sel = "a[href], button, input:not([type=hidden]), select, textarea, [role=tab], [role=option]";
      for (const el of document.querySelectorAll<HTMLElement>(sel)) {
        const b = el.getBoundingClientRect();
        if (b.width <= 1 || b.height <= 1 || getComputedStyle(el).visibility === "hidden") continue;
        if (el.tagName === "A" && el.closest("p")) continue;
        if (!includeDense && el.hasAttribute("data-dense-target")) continue;
        if (Math.min(b.width, b.height) < min) {
          const name = (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 30);
          out.push(`${name} (${Math.round(b.width)}×${Math.round(b.height)})`);
        }
      }
      return out;
    },
    { min, includeDense },
  );
}

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use(mobile(width));

    for (const p of PAGES) {
      test(`${p.name}: no sideways scroll, touch-sized controls`, async ({ page, context, baseURL }) => {
        if (p.as) {
          test.skip(!seed(), "needs the seeded session tokens (E2E_SEED_FILE)");
          await signIn(context, baseURL!, p.as);
        }
        await page.goto(p.path);
        await page.waitForLoadState("networkidle");
        expect(new URL(page.url()).pathname).toBe(new URL(p.path, baseURL).pathname);

        // Against the configured width, not window.innerWidth: with isMobile,
        // Chrome widens the layout viewport to fit overflowing content, so
        // that comparison could never fail (it missed the landing wordmark).
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(scrollWidth, "page scrolls sideways").toBeLessThanOrEqual(width);
        expect(await smallTargets(page, 24, true), "under the WCAG 24px minimum").toEqual([]);
        expect(await smallTargets(page, 44, false), "under 44px").toEqual([]);
      });
    }
  });
}

for (const width of WIDTHS) {
  test(`${width}px: the flyer viewer fits and its controls are touch-sized`, async ({ browser }) => {
    const context = await browser.newContext(mobile(width));
    const page = await context.newPage();
    await page.goto("/calendar/events/ev-date-only");
    await page.getByRole("button", { name: /^Open full screen/ }).click();
    const viewer = page.getByRole("dialog", { name: "Henna Night flyers" });
    await expect(viewer).toBeVisible();
    const box = (await viewer.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    // The flyer fits on screen, whole.
    const img = (await viewer.getByRole("img", { name: "Henna Night flyer, 1 of 3" }).boundingBox())!;
    expect(img.x).toBeGreaterThanOrEqual(0);
    expect(img.x + img.width).toBeLessThanOrEqual(width + 0.5);
    expect(img.y + img.height).toBeLessThanOrEqual(844 + 0.5);
    expect(await smallTargets(page, 44, false), "under 44px").toEqual([]);
    await context.close();
  });
}

test.describe("day view on phones is a stacked agenda", () => {
  for (const width of [375, 390] as const) {
    test(`${width}px: prayer markers and every event, in time order`, async ({ browser }) => {
      const context = await browser.newContext({ ...mobile(width), timezoneId: "America/Los_Angeles" });
      const page = await context.newPage();
      await page.goto("/calendar?view=day&date=2026-10-23");

      await expect(page.locator(".day-grid")).toBeHidden();
      const agenda = page.getByRole("list", { name: /Prayer times and events, Friday, October 23/ });
      await expect(agenda).toBeVisible();

      const rows = await agenda.locator(":scope > li").evaluateAll((els) =>
        els.map((el) =>
          el.matches(".day-agenda__prayer")
            ? `[${el.getAttribute("data-prayer")}]`
            : (el.querySelector("[data-card-title]")?.textContent ?? ""),
        ),
      );
      expect(rows).toEqual([
        "Qiyam al-Layl", // before Fajr
        "[fajr]",
        "[sunrise]",
        "[dhuhr]",
        "Jummah Prayer", // overlaps the next one: both listed
        "Brothers' Basketball",
        "[asr]",
        "[maghrib]",
        "[isha]",
        "Night Hike to the Lookout", // after Isha
      ]);
      await expect(agenda.locator('[data-prayer="fajr"]')).toHaveText(/^Fajr \d{1,2}:\d\d AM$/);
      await expect(agenda.getByRole("link", { name: /Jummah Prayer/ })).toBeVisible();
      await expect(agenda.getByRole("link", { name: /Brothers' Basketball/ })).toBeVisible();
      await context.close();
    });
  }

  test("768px keeps the prayer-aligned grid", async ({ browser }) => {
    const context = await browser.newContext(mobile(768));
    const page = await context.newPage();
    await page.goto("/calendar?view=day&date=2026-10-23");
    await expect(page.locator(".day-grid")).toBeVisible();
    await expect(page.locator(".day-agenda")).toBeHidden();
    await context.close();
  });
});

test.describe("month view on phones", () => {
  test.use(mobile(390));

  test("cells show dots instead of clipped chips, with the month listed below", async ({ page }) => {
    await page.goto("/calendar?view=month&date=2026-10-20");
    const cell = page.getByRole("link", { name: "Friday, October 23, 4 events" });
    await expect(cell).toBeVisible();
    await expect(cell.getByText("Jummah Prayer")).toBeHidden();
    const list = page.getByRole("region", { name: "October events" });
    // Once Oct 23 is past in the current month, its list moves into the fold.
    const earlier = list.locator("details.month-agenda__earlier");
    if ((await earlier.count()) && (await earlier.getAttribute("open")) === null) {
      await earlier.locator("summary").click();
    }
    await expect(list.getByRole("link", { name: /Night Hike to the Lookout/ })).toBeVisible();
  });
});

test.describe("admin nav on phones", () => {
  test.use(mobile(375));

  test("the menu opens, its links are touch-sized, and Escape closes it", async ({ page, context, baseURL }) => {
    test.skip(!seed(), "needs the seeded session tokens (E2E_SEED_FILE)");
    await signIn(context, baseURL!, "admin");
    await page.goto("/admin");
    await page.getByRole("button", { name: "Open menu" }).click();
    const menu = page.locator("#site-header-mobile-menu");
    for (const name of ["Events", "Admins", "Nominations", "Calendar"]) {
      const box = await menu.getByRole("link", { name }).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  });

  test("form fields use 16px+ text so iOS doesn't zoom on focus", async ({ page, context, baseURL }) => {
    test.skip(!seed(), "needs the seeded session tokens (E2E_SEED_FILE)");
    await signIn(context, baseURL!, "admin");
    for (const path of ["/admin/events/new", "/admin/nominations"]) {
      await page.goto(path);
      const sizes = await page
        // Only fields that take typing zoom; a chip's checkbox doesn't.
        .locator("input:not([type=hidden], [type=checkbox], [type=radio]), textarea")
        .evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
      expect(sizes.length).toBeGreaterThan(0);
      for (const s of sizes) expect(s).toBeGreaterThanOrEqual(16);
    }
  });
});
