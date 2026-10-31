import { test, expect, type Page } from "@playwright/test";

// The home page's paper jungle: decoration only, never in the way of anything,
// and still for people who ask for less motion.

const y = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m42);

for (const [name, viewport] of [["phone", { width: 390, height: 844 }], ["laptop", { width: 1440, height: 900 }]] as const) {
  test.describe(name, () => {
    test.use({ viewport });

    test("the plants say nothing to screen readers and never scroll the page sideways", async ({ page }) => {
      await page.goto("/");
      const plants = page.locator("img[src*='/jungle/']");
      expect(await plants.count()).toBeGreaterThan(5);
      for (const alt of await plants.evaluateAll((els) => els.map((el) => el.getAttribute("alt")))) expect(alt).toBe("");
      for (const box of [".jungle-stage", ".jungle-front", ".jungle-footer"]) {
        await expect(page.locator(box)).toHaveAttribute("aria-hidden", "true");
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    });

    test("nothing in the jungle takes a tap meant for the socials or the top bar", async ({ page }) => {
      await page.goto("/");
      for (const name of [/Instagram/, /WhatsApp/, /Calendar/]) {
        const link = page.getByRole("link", { name }).first();
        const box = (await link.boundingBox())!;
        const hit = await page.evaluate(
          ([x, y]) => document.elementFromPoint(x, y)?.closest("a")?.href ?? null,
          [box.x + box.width / 2, box.y + box.height / 2],
        );
        expect(hit).toBe(await link.evaluate((a: HTMLAnchorElement) => a.href));
      }
    });
  });
}

test("far layers lag behind the scroll and near ones race ahead", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() => window.scrollTo(0, 300));
  await expect.poll(() => y(page, ".jungle-stage .jungle-layer")).toBeGreaterThan(100);
  expect(await y(page, ".jungle-front .jungle-layer")).toBeLessThan(0);
});

test("with less motion asked for, the jungle stays still", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() => window.scrollTo(0, 300));
  await page.waitForTimeout(200);
  expect(await y(page, ".jungle-stage .jungle-layer")).toBe(0);
  expect(await page.locator(".jungle-cut--palm-right").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
});
