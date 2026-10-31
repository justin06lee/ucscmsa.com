import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./fixtures";

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

test("on a phone, the title stays in front of the leaves as the page scrolls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const order = await page.evaluate(() => {
    const z = (sel: string) => Number(getComputedStyle(document.querySelector(sel)!).zIndex);
    return { leaves: z(".jungle-front > .jungle-layer"), title: z(".jungle-clearing"), edge: z(".jungle-cut--edge") };
  });
  expect(order.leaves).toBeLessThan(order.title);
  expect(order.title).toBeLessThan(order.edge);
});

test("a wide flyer's paper hugs it: no blank band above or below", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const card = page.locator(".upcoming-card").filter({ hasText: "Laser Tag" }).locator(".pasted");
  const [paper, flyer] = await card.evaluate((el) => {
    const img = el.querySelector("img")!;
    return [(el as HTMLElement).offsetHeight, img.offsetHeight];
  });
  expect(Math.abs(paper - flyer)).toBeLessThanOrEqual(1);
});

for (const width of [320, 375, 390]) {
  test(`at ${width}px wide, every hero letter is whole and on screen`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    const letters = page.getByRole("img", { name: "MSA at UCSC" }).locator("img");
    await expect(letters).toHaveCount(8);
    await page.waitForTimeout(1600); // The letters have landed.
    for (const box of await letters.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()))) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(width);
      expect(box.height).toBeGreaterThanOrEqual(24);
    }
  });
}

test("only the home page has the jungle and the falling letters", async ({ page, context, baseURL }) => {
  const clean = async (paths: string[]) => {
    for (const path of paths) {
      await page.goto(path);
      await expect(page.locator("img[src*='/jungle/'], .jungle-stage, [data-drop]"), path).toHaveCount(0);
    }
  };
  // Signed in, /login goes back to the home page.
  await clean(["/calendar", "/calendar?view=year", "/calendar/events/ev-potluck", "/login", "/nope"]);
  await signIn(context, baseURL!, "admin");
  await clean(["/admin", "/admin/playbook", "/admin/events/new"]);
});

test("phones load the lighter plant images", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const src = await page.locator(".jungle-cut--far").evaluate((el: HTMLImageElement) => el.currentSrc);
  expect(src).toContain("-sm.webp");
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
