import { test, expect, type Page } from "@playwright/test";

// The October 28 look round (Justin's list): a see-through top bar with the
// Calendar link, the social buttons under the landing's logo, the sliding
// view switch, the school-year year view and a day that fits a laptop screen.
// Since the October 30 redesign, the logo's lowered-on-ropes intro too.

const TZ = "America/Los_Angeles";
const thisMonth = () => new Date().toLocaleDateString("en-US", { timeZone: TZ, month: "long" });

test.describe("landing", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  // The intro's script writes one stylesheet: read it as it's added, since it
  // removes itself once the logo has landed.
  const introOrders = (page: Page) =>
    page.evaluate(() => (window as unknown as { __intro: string[] }).__intro.map((css) =>
      [...css.matchAll(/data-drop="(\d)"/g)].map((m) => Number(m[1])),
    ));
  const watchIntro = (page: Page) =>
    page.addInitScript(() => {
      const seen: string[] = [];
      (window as unknown as { __intro: string[] }).__intro = seen;
      new MutationObserver((records) => {
        for (const r of records) for (const n of r.addedNodes) {
          if (n instanceof HTMLStyleElement && n.textContent?.includes("dropIn")) seen.push(n.textContent);
        }
      }).observe(document, { childList: true, subtree: true });
    });

  test("the moon and letters come down together in a fast ripple, then settle", async ({ page }) => {
    await watchIntro(page);
    await page.goto("/");
    await expect(page.locator("[data-drop]")).toHaveCount(9);
    const css = await page.evaluate(() => (window as unknown as { __intro: string[] }).__intro[0]);
    expect((await introOrders(page))[0]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const delays = [...css.matchAll(/ (\d+)ms both/g)].map((m) => Number(m[1]));
    expect(delays).toHaveLength(9);
    expect(Math.max(...delays) - Math.min(...delays)).toBeLessThan(260);
  });

  test("the intro stays still for people who ask for less motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await watchIntro(page);
    await page.goto("/");
    await expect(page.locator("[data-drop]")).toHaveCount(9);
    expect(await introOrders(page)).toEqual([]);
  });

  test("the top bar has no background and links to the calendar", async ({ page }) => {
    await page.goto("/");
    const header = page.getByRole("banner");
    await expect(header.getByRole("link", { name: "Calendar" })).toHaveAttribute("href", "/calendar");
    const look = await header.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, border: cs.borderBottomWidth, position: cs.position };
    });
    expect(look.bg).toBe("rgba(0, 0, 0, 0)");
    expect(look.border).toBe("0px");
    expect(look.position).not.toBe("sticky");
  });

  test("Instagram and WhatsApp open in a new tab; the email button copies the address", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/");
    const social = page.getByRole("list", { name: "Find us" });
    const ig = social.getByRole("link", { name: /^Instagram/ });
    await expect(ig).toHaveAttribute("href", "https://www.instagram.com/ucsc.msa/");
    await expect(ig).toHaveAttribute("target", "_blank");
    await expect(ig).toHaveAttribute("rel", "noopener noreferrer");
    const wa = social.getByRole("link", { name: /^WhatsApp/ });
    await expect(wa).toHaveAttribute("href", /^https:\/\/docs\.google\.com\/forms\//);
    await expect(wa).toHaveAttribute("target", "_blank");

    const copy = social.getByRole("button", { name: /salam@ucscmsa\.com/ });
    // Icon-only ghost buttons: round 44px targets, no border, no text showing.
    for (const b of [ig, wa, copy]) {
      const box = (await b.boundingBox())!;
      expect([box.width, box.height]).toEqual([44, 44]);
      expect(await b.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("0px");
    }
    // The address only shows in the tip, which is clear until hover or focus.
    await expect(copy.getByText("salam@ucscmsa.com", { exact: true })).toHaveCSS("opacity", "0");
    const before = (await copy.boundingBox())!.width;
    await copy.click();
    await expect(page.getByRole("status").filter({ hasText: "Copied salam@ucscmsa.com" })).toBeAttached();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("salam@ucscmsa.com");
    // The check and "Copied" don't change the button's size.
    expect((await copy.boundingBox())!.width).toBe(before);
  });
});

test.describe("calendar", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the view switch's pill slides to the view picked", async ({ page }) => {
    await page.goto("/calendar?view=month&date=2026-10-20");
    const pill = page.locator("[data-view-pill]");
    const month = (await pill.boundingBox())!;
    await page.getByRole("tab", { name: "year" }).click();
    await page.waitForURL(/view=year/);
    await expect(page.getByRole("tab", { name: "year" })).toHaveAttribute("aria-selected", "true");
    await expect.poll(async () => (await pill.boundingBox())!.x).toBeGreaterThan(month.x + 20);
  });

  test("the year view is the school year, September to August, with this month marked", async ({ page }) => {
    await page.goto("/calendar?view=year");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("This school year");
    const months = page.locator("a[href^='/calendar?view=month&date=']:visible");
    await expect(months).toHaveCount(12);
    const names = (await months.allTextContents()).map((t) => t.replace(/\s*\d{4}|Now|Summer/g, "").trim());
    expect(names).toEqual([
      "September", "October", "November", "December", "January", "February",
      "March", "April", "May", "June", "July", "August",
    ]);
    await expect(months.nth(10)).toContainText("Summer");
    const current = page.locator("[data-current-month]");
    await expect(current).toHaveCount(1);
    await expect(current).toContainText(thisMonth());
    await expect(current).toContainText("Now");
  });

  test("a whole day, Fajr to Isha and its events, fits a 1440 by 900 screen", async ({ page }) => {
    await page.goto("/calendar?view=day&date=2026-10-23");
    await expect(page.locator(".day-grid__event").first()).toBeVisible();
    const grid = (await page.locator(".day-grid").boundingBox())!;
    expect(grid.y + grid.height).toBeLessThanOrEqual(900);
  });
});
