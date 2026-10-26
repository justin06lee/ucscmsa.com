/** Capture the visual editor against a scratch server, never production.
 * bun scripts/visual-playbook-demo.ts --base http://localhost:3340 --seed /tmp/ucscmsa-visual-seed.json
 */
import { chromium, expect } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : process.argv[i + 1];
};
const base = arg("base", "http://localhost:3340");
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base))
  throw new Error("Scratch servers only");
const { adminToken } = JSON.parse(
  readFileSync(arg("seed", "/tmp/ucscmsa-visual-seed.json"), "utf8"),
) as { adminToken: string };
const out = arg("out", "docs/screenshots/playbook-visual");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1280, 375]) {
    const context = await browser.newContext({
      viewport: { width, height: 980 },
      timezoneId: "America/Los_Angeles",
    });
    await context.addCookies([
      { name: "authjs.session-token", value: adminToken, url: base },
    ]);
    const page = await context.newPage();
    await page.goto(`${base}/admin/playbook`);
    await page.getByRole("button", { name: "Add step", exact: true }).click();
    await page.getByLabel("Step title").fill("Book the space");
    const editor = page.getByRole("textbox", {
      name: "What to do",
      exact: true,
    });
    await editor.fill("Choose the right space");
    await page.getByLabel("Block style").selectOption("numberedListItem");
    await editor.press("ControlOrMeta+End");
    await editor.press("Enter");
    await page.keyboard.type("Send the booking form");
    await page
      .getByRole("button", { name: "+ Add a subtask", exact: true })
      .click();
    await page.keyboard.type("Confirm the date with our advisor");
    await page
      .getByRole("button", { name: "+ Add a block", exact: true })
      .click();
    await page.keyboard.type("Keep the confirmation email. ");
    await page.getByRole("button", { name: "Link", exact: true }).click();
    await page.getByLabel("Link label").fill("Spaces directory");
    await page
      .getByLabel("Web address")
      .fill("https://spaces.ucsc.edu/spaces-directory/");
    await page.getByRole("button", { name: "Save link", exact: true }).click();
    await page.getByLabel("Lead time unit").selectOption("weeks");
    await page.getByLabel("Lead time", { exact: true }).fill("2");
    await page.getByLabel("Applies to").selectOption("room");
    await page.getByLabel("Step title").focus();
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      return document.fonts.ready;
    });
    await expect(editor).toContainText("Confirm the date with our advisor");
    await page.screenshot({
      path: path.join(out, `editor-${width}.png`),
      animations: "disabled",
    });
    await editor
      .getByRole("link", { name: "Spaces directory", exact: true })
      .click();
    await expect(page.getByRole("dialog", { name: "Edit link" })).toBeVisible();
    await page.getByLabel("Link label").focus();
    await page.screenshot({
      path: path.join(out, `link-editor-${width}.png`),
      animations: "disabled",
    });
    await page.goto(`${base}/admin/playbook/book-a-room`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: path.join(out, `guide-${width}.png`),
      animations: "disabled",
    });
    await context.close();
  }
  process.stdout.write(`Screenshots in ${out}\n`);
} finally {
  await browser.close();
}
