/** Screenshots against a scratch LOCAL database; never production.
 * bun scripts/playbook-agent-demo.ts --base http://localhost:3340 --seed /tmp/playbook-seed.json --out docs/screenshots/playbook-board
 */
import { chromium, expect } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { addDaysYmd } from "../lib/planning";
import { toLocalYmd } from "../lib/time";
const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : process.argv[i + 1];
};
const base = arg("base", "http://localhost:3340");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base))
  throw new Error("Scratch local servers only");
const { adminToken } = JSON.parse(
  readFileSync(arg("seed", "/tmp/playbook-seed.json"), "utf8"),
) as { adminToken: string };
const out = arg("out", "docs/screenshots/playbook-board");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const desktop = await browser.newContext({
    viewport: { width: 1280, height: 960 },
    timezoneId: "America/Los_Angeles",
  });
  await desktop.addCookies([
    { name: "authjs.session-token", value: adminToken, url: base },
  ]);
  const page = await desktop.newPage();
  await page.goto(`${base}/admin/playbook`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    animations: "disabled",
    path: path.join(out, "board-desktop.png"),
  });
  await page
    .getByRole("button", { name: "Apply for funding", exact: true })
    .click();
  await page
    .locator('[data-card="funding"]')
    .screenshot({
      animations: "disabled",
      path: path.join(out, "inline-editor-desktop.png"),
    });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const handle = page
    .locator("[data-card]")
    .first()
    .getByRole("button", { name: /^Move / });
  await handle.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox();
  const to = await page.locator("[data-card]").nth(1).boundingBox();
  if (!from || !to) throw new Error("Missing drag target");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  await expect(page.getByRole("status")).toHaveText("Order saved.");
  await desktop.close();
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    timezoneId: "America/Los_Angeles",
  });
  await phone.addCookies([
    { name: "authjs.session-token", value: adminToken, url: base },
  ]);
  const mobile = await phone.newPage();
  await mobile.goto(`${base}/admin/playbook`);
  await mobile.evaluate(() => document.fonts.ready);
  await mobile.screenshot({
    animations: "disabled",
    path: path.join(out, "board-phone.png"),
  });
  await mobile.goto(`${base}/admin/plan`);
  await mobile
    .getByLabel("What are you planning?")
    .fill(
      `Iftar, ${addDaysYmd(toLocalYmd(new Date()), 18)}, ~80 people, serving food, need a room`,
    );
  await mobile
    .getByRole("button", { name: "Make a timeline", exact: true })
    .click();
  await mobile.getByRole("heading", { name: "Review your plan" }).waitFor();
  await expect(
    mobile.getByRole("button", { name: "Try again", exact: true }),
  ).toBeEnabled();
  await mobile.screenshot({
    animations: "disabled",
    path: path.join(out, "plan-review-phone.png"),
    fullPage: true,
  });
  await mobile
    .getByRole("button", { name: "Save draft and checklist" })
    .click();
  await mobile.waitForURL(/\/admin\/plan\/[0-9A-Z]{26}$/);
  await mobile
    .getByRole("list", { name: "Checklist" })
    .getByText("Book a room (after filing the proposal)", { exact: true })
    .click();
  await expect(
    mobile
      .getByRole("list", { name: "Checklist" })
      .locator('[data-state="done"]')
      .filter({ hasText: "Book a room" }),
  ).toBeVisible();
  await mobile.evaluate(() => window.scrollTo(0, 0));
  await mobile.screenshot({
    animations: "disabled",
    path: path.join(out, "saved-timeline-phone.png"),
    fullPage: true,
  });
  await phone.close();
  process.stdout.write(`Screenshots in ${out}\n`);
} finally {
  await browser.close();
}
