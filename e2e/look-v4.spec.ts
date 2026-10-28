import { test, expect } from "@playwright/test";

// The October 28 look round (Justin's list): a see-through top bar with the
// Calendar link, the social buttons under the landing's logo, the sliding
// view switch, the school-year year view and a day that fits a laptop screen.

const TZ = "America/Los_Angeles";
const thisMonth = () => new Date().toLocaleDateString("en-US", { timeZone: TZ, month: "long" });

test.describe("landing", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the top bar has no background and links to the calendar", async ({ page }) => {
    await page.goto("/");
    const header = page.locator("body > header");
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
    const before = (await copy.boundingBox())!.width;
    await copy.click();
    await expect(page.getByRole("status").filter({ hasText: "Copied salam@ucscmsa.com" })).toBeAttached();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("salam@ucscmsa.com");
    // "Copied" takes the address's place without changing the button's size.
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
