/**
 * ~40s phone demo of the board section, signed in as the seeded admin on a
 * LOCAL server (seeded fake data; never production): the Playbook → a guide →
 * plan a draft event with tags → its timeline (today marker, an overdue task,
 * tick a checkbox) → the Planning overview.
 *
 *   bun scripts/seed-local.ts file:/tmp/demo.db > /tmp/board-demo-seed.json
 *   (next start on that DB, with ADMIN_SEED_EMAILS from playwright.config.ts)
 *   bun scripts/board-demo-video.ts --base http://localhost:3232 --seed /tmp/board-demo-seed.json
 *
 * Records a 390x844 touch phone, trims the blank lead-in, converts to H.264 MP4
 * at 780x1688, and prints each step's start time in the finished video.
 */
import { chromium, type Locator, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const BASE = arg("base", "http://localhost:3232");
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(BASE)) throw new Error("local servers only");
const SEED = JSON.parse(readFileSync(arg("seed", "/tmp/board-demo-seed.json"), "utf8")) as { adminToken: string };
const OUT = arg("out", path.join(os.homedir(), "Movies/ucscmsa/ucscmsa-board-demo.mp4"));
const W = 390;
const H = 844;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function scrollTo(page: Page, y: number, ms = 1000) {
  await page.evaluate(
    ([to, dur]) =>
      new Promise<void>((done) => {
        const from = window.scrollY;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const target = Math.max(0, Math.min(to, max));
        const t0 = performance.now();
        const step = (now: number) => {
          const p = Math.min(1, (now - t0) / dur);
          const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
          window.scrollTo(0, from + (target - from) * e);
          if (p < 1) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      }),
    [y, ms] as const,
  );
}

async function scrollToShow(page: Page, el: Locator, offset = 120, ms = 1000) {
  const top = await el.evaluate((n) => n.getBoundingClientRect().top + window.scrollY);
  await scrollTo(page, top - offset, ms);
}

async function tap(page: Page, el: Locator) {
  await el.scrollIntoViewIfNeeded();
  const b = (await el.boundingBox())!;
  await page.evaluate(
    ([x, y]) => {
      const d = document.createElement("div");
      d.style.cssText = `position:fixed;left:${x - 18}px;top:${y - 18}px;width:36px;height:36px;border-radius:50%;background:rgba(107,31,42,.28);pointer-events:none;z-index:2147483647;transition:opacity .45s ease,transform .45s ease`;
      document.body.appendChild(d);
      requestAnimationFrame(() => {
        d.style.opacity = "0";
        d.style.transform = "scale(1.6)";
      });
      setTimeout(() => d.remove(), 600);
    },
    [b.x + b.width / 2, b.y + b.height / 2] as const,
  );
  await sleep(200);
  await el.tap({ timeout: 3000 });
}

async function settle(page: Page) {
  await page.waitForLoadState("load");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** Santa Cruz's date `days` from now, as the date picker labels its days. */
function dayLabel(days: number) {
  return new Date(Date.now() + days * 86_400_000).toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

async function pickDate(page: Page, field: string, label: string) {
  await tap(page, page.getByLabel(new RegExp(`^${field}`)));
  const dialog = page.getByRole("dialog", { name: "Choose date" });
  for (let i = 0; i < 3 && !(await dialog.getByRole("gridcell", { name: label }).isVisible()); i++) {
    await sleep(250);
    await tap(page, dialog.getByRole("button", { name: "Next month" }));
  }
  await sleep(300);
  await tap(page, dialog.getByRole("gridcell", { name: label }));
}

async function typeTime(page: Page, field: string, value: string) {
  const input = page.getByRole("textbox", { name: new RegExp(`^${field}`) });
  await tap(page, input);
  await input.pressSequentially(value, { delay: 60 });
  await input.press("Enter");
}

async function main() {
  mkdirSync(path.dirname(OUT), { recursive: true });
  const tmp = mkdtempSync(path.join(os.tmpdir(), "ucscmsa-board-demo-"));
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    timezoneId: "America/Los_Angeles",
    recordVideo: { dir: tmp, size: { width: W, height: H } },
  });
  await context.addCookies([{ name: "authjs.session-token", value: SEED.adminToken, url: BASE }]);
  const page = await context.newPage();
  const t0 = Date.now();
  const marks: [number, string][] = [];
  let lead = 0;
  const mark = (label: string) => marks.push([(Date.now() - t0) / 1000 - lead, label]);

  await page.goto(`${BASE}/admin/playbook`);
  await settle(page);
  await sleep(300);
  lead = (Date.now() - t0) / 1000;

  // 1. The Playbook, then one guide.
  mark("Playbook: the five guides");
  await sleep(2000);
  mark("tap: Book a room");
  await tap(page, page.getByRole("link", { name: /Book a room/ }).first());
  await page.waitForURL(/\/admin\/playbook\/book-a-room$/);
  await settle(page);
  mark("guide: steps, the room form, TODOs, last edited");
  await sleep(1500);
  await scrollTo(page, 420, 1600);
  await sleep(1400);
  await scrollTo(page, 900, 1400);
  await sleep(1000);

  // 2. Plan a draft event with tags, 20 days out: funding (21 days before)
  // is already overdue.
  await page.goto(`${BASE}/admin/plan`);
  await settle(page);
  mark("Planning overview, tap: Plan an event");
  await sleep(900);
  await tap(page, page.getByRole("link", { name: "Plan an event" }));
  await page.waitForURL(/\/admin\/events\/new\?draft=1/);
  await settle(page);
  mark("form: title, date, times");
  await tap(page, page.getByLabel("Title", { exact: true }));
  await page.getByLabel("Title", { exact: true }).pressSequentially("Interfaith Iftar Dinner", { delay: 45 });
  const day = dayLabel(20);
  await pickDate(page, "Start date", day);
  await typeTime(page, "Start time", "6:30 PM");
  await pickDate(page, "End date", day);
  await typeTime(page, "End time", "9:00 PM");
  const needs = page.getByRole("group", { name: "It needs" });
  await scrollToShow(page, needs, 330, 900);
  mark("Draft, and tags: Room, Food, Funding");
  for (const tag of ["Room", "Food", "Funding"]) {
    await sleep(250);
    await tap(page, needs.getByText(tag, { exact: true }));
  }
  await sleep(600);
  mark("tap: Create event");
  await tap(page, page.getByRole("button", { name: "Create event" }));

  // 3. Its timeline.
  await page.waitForURL(/\/admin\/plan\/[0-9A-Z]{26}$/);
  await settle(page);
  mark("timeline: draft, tags, the checklist");
  await sleep(1500);
  const checklist = page.getByRole("list", { name: "Checklist" });
  await scrollToShow(page, checklist, 150, 1200);
  mark("overdue funding task, the today marker");
  await sleep(2200);
  const room = checklist.locator("label").filter({ hasText: "Book a room" });
  mark("tick: Book a room");
  await tap(page, room);
  await page.waitForFunction(() =>
    [...document.querySelectorAll("[data-state=done]")].some((n) => n.textContent?.includes("Book a room")),
  );
  await sleep(1800);

  // 4. Back to the overview.
  await scrollTo(page, 0, 700);
  mark("tap: Planning (the overview)");
  await tap(page, page.getByRole("link", { name: "Planning" }).filter({ visible: true }).last());
  await page.waitForURL(/\/admin\/plan$/);
  await settle(page);
  mark("overview: each plan's next step and overdue count");
  await sleep(2800);
  mark("end");

  await context.close();
  await browser.close();

  const webm = path.join(tmp, readdirSync(tmp).find((f) => f.endsWith(".webm"))!);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-ss", lead.toFixed(2), "-i", webm,
    "-vf", `scale=${W * 2}:${H * 2}:flags=lanczos`,
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
    "-r", "30", "-movflags", "+faststart", "-an", OUT,
  ]);
  rmSync(tmp, { recursive: true, force: true });
  console.log(`wrote ${OUT}`);
  for (const [t, label] of marks) console.log(`${t.toFixed(1).padStart(5)}s  ${label}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
