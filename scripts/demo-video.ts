/**
 * ~30s phone demo of the site: landing → Upcoming → calendar day agenda with
 * prayer markers → month → year → an event page → a Jummah page.
 *
 *   bun scripts/demo-video.ts [--base https://ucscmsa.com] [--out ~/Movies/ucscmsa/ucscmsa-v2-demo.mp4]
 *     [--date 2026-10-23] [--event "Laser Tag"] [--jummah "Jummah 1"]
 *
 * Read-only: it only loads pages and taps links (never sign-in, RSVP or admin),
 * so it is safe against production. Records a 390x844 touch phone, trims the
 * blank lead-in, and converts Playwright's webm to H.264 MP4 at 780x1688.
 * Prints each step's start time in the finished video.
 */
import { chromium, type Locator, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const BASE = arg("base", "https://ucscmsa.com");
const OUT = arg("out", path.join(os.homedir(), "Movies/ucscmsa/ucscmsa-v2-demo.mp4"));
const DAY = arg("date", "2026-10-23");
const EVENT = arg("event", "Laser Tag");
const JUMMAH = arg("jummah", "Jummah 1");
const W = 390;
const H = 844;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Eased scroll so the video moves smoothly rather than jumping.
async function scrollTo(page: Page, y: number, ms = 1200) {
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

async function scrollToShow(page: Page, el: Locator, offset = 120, ms = 1200) {
  const top = await el.evaluate((n) => n.getBoundingClientRect().top + window.scrollY);
  await scrollTo(page, top - offset, ms);
}

// A brief touch dot where the finger lands, so viewers can follow the taps.
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
  await sleep(250);
  try {
    await el.tap({ timeout: 3000 });
  } catch {
    // A page wider than the screen (it happened with the old landing
    // wordmark) shifts touch coordinates; say so rather than hide it.
    console.warn(`warning: tap missed, clicking instead: ${await el.textContent()}`);
    await el.evaluate((n) => (n as HTMLElement).click());
  }
}

async function settle(page: Page) {
  await page.waitForLoadState("load");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  // The calendar streams its view in; hold on the real thing, not the skeleton.
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
}

async function main() {
  mkdirSync(path.dirname(OUT), { recursive: true });
  const tmp = mkdtempSync(path.join(os.tmpdir(), "ucscmsa-demo-"));
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    timezoneId: "America/Los_Angeles",
    // Playwright's recorder captures CSS pixels whatever the scale factor, so
    // record at 390x844 and upscale in ffmpeg below.
    recordVideo: { dir: tmp, size: { width: W, height: H } },
  });
  const page = await context.newPage();
  const t0 = Date.now();
  const marks: [number, string][] = [];
  let lead = 0;
  const mark = (label: string) => marks.push([(Date.now() - t0) / 1000 - lead, label]);

  await page.goto(`${BASE}/`);
  await settle(page);
  await sleep(300);
  lead = (Date.now() - t0) / 1000;

  // 1. Landing, then down through Upcoming.
  mark("landing: logo and intro");
  await sleep(1500);
  mark("scroll to Upcoming");
  await scrollToShow(page, page.getByRole("heading", { name: "Upcoming" }), 60);
  await sleep(1800);

  // 2. Into the calendar, then the day with events: the phone agenda.
  const full = page.getByRole("link", { name: /See the full calendar/ });
  await scrollToShow(page, full, 500, 700);
  mark("tap: See the full calendar");
  await tap(page, full);
  await page.waitForURL(/\/calendar$/);
  await settle(page);
  await sleep(800);
  const dayCell = page.getByRole("link", { name: new RegExp(`^${new Date(`${DAY}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}, \\d+ events?$`) });
  mark(`tap: ${DAY} in the month grid`);
  await tap(page, dayCell);
  await page.waitForURL(/view=day/);
  await settle(page);
  mark("day agenda: prayer markers and events");
  await sleep(1200);
  const agenda = page.locator(".day-agenda");
  await scrollToShow(page, agenda.getByRole("link", { name: new RegExp(EVENT) }), 330, 1400);
  await sleep(1700);

  // 3. Month, then year.
  await scrollTo(page, 0, 600);
  mark("tap: Month");
  await tap(page, page.getByRole("tab", { name: "month" }));
  await page.waitForURL(/view=month/);
  await settle(page);
  await sleep(1000);
  await scrollToShow(page, page.getByRole("region", { name: /events$/ }), 140, 1000);
  await sleep(800);
  await scrollTo(page, 0, 600);
  mark("tap: Year");
  await tap(page, page.getByRole("tab", { name: "year" }));
  await page.waitForURL(/view=year/);
  await settle(page);
  await sleep(1600);

  // 4. The event, then a Jummah page.
  mark("tap: Day (back to the same date)");
  await tap(page, page.getByRole("tab", { name: "day" }));
  await page.waitForURL(/view=day/);
  await settle(page);
  const eventCard = page.locator(".day-agenda").getByRole("link", { name: new RegExp(EVENT) });
  await scrollToShow(page, eventCard, 330, 900);
  mark(`tap: ${EVENT}`);
  await tap(page, eventCard);
  await page.waitForURL(/\/calendar\/events\//);
  await settle(page);
  mark("event page");
  await sleep(2300);
  await page.goBack();
  await settle(page);
  const jummah = page.locator(".day-agenda").getByRole("link", { name: new RegExp(JUMMAH) });
  await scrollToShow(page, jummah, 330, 700);
  mark(`tap: ${JUMMAH}`);
  await tap(page, jummah);
  await page.waitForURL(/\/calendar\/events\//);
  await settle(page);
  mark("Jummah page");
  await sleep(2400);
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
