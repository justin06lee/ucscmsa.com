/**
 * ~1 min demo of the Luma-style event displays, desktop then phone, as one
 * 1920x1080 video. Desktop: the landing's Upcoming cards and Past events, an
 * event page (cover left, details and RSVP right), its RSVP button opening
 * the form in a new tab, the month grid, back to a passed event. Phone: the
 * stacked cards, an event without a flyer (its fallback cover), the month and
 * day timelines, and an event page stacked.
 *
 *   bun scripts/luma-demo.ts --base http://localhost:3100 --out tmp/ucscmsa-luma-demo.mp4 \
 *     [--at 2026-10-21T14:00:00-07:00]
 *
 * Meant for a local `next start` on the public snapshot, with the server's
 * clock set to --at as well (scripts/fake-now.cjs), so the browser and the
 * server agree on "now". Read-only: it loads pages and follows links; the
 * RSVP form it opens is closed, never filled in.
 */
import { chromium, type Browser, type Locator, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { arg, scrollTo, scrollToShow, settle, sleep, tap } from "./demo-kit";

const BASE = arg("base", "http://localhost:3100");
const OUT = arg("out", "tmp/ucscmsa-luma-demo.mp4");
const AT = arg("at", "2026-10-21T14:00:00-07:00");
const PAPER = "0xf5efe2";

type Clip = { webm: string; lead: number; marks: [number, string][] };

async function clip(
  browser: Browser,
  tmp: string,
  size: { width: number; height: number },
  phone: boolean,
  run: (page: Page, mark: (label: string) => void) => Promise<void>,
): Promise<Clip> {
  const dir = mkdtempSync(path.join(tmp, phone ? "phone-" : "desktop-"));
  const context = await browser.newContext({
    viewport: size,
    deviceScaleFactor: 2,
    isMobile: phone,
    hasTouch: phone,
    timezoneId: "America/Los_Angeles",
    recordVideo: { dir, size },
  });
  const page = await context.newPage();
  // The browser agrees with the server on "now" (a fixed moment; timers run as usual).
  await page.clock.setFixedTime(new Date(AT));
  if (!phone) await page.addInitScript(cursorScript);
  const t0 = Date.now();
  const marks: [number, string][] = [];
  let lead = 0;
  await page.goto(`${BASE}/`);
  await settle(page);
  await sleep(400);
  lead = (Date.now() - t0) / 1000;
  await run(page, (label) => marks.push([(Date.now() - t0) / 1000 - lead, label]));
  marks.push([(Date.now() - t0) / 1000 - lead, "end"]);
  // This page's own recording: a tab it opened (the RSVP form) gets one too.
  const video = page.video()!;
  await context.close();
  return { webm: await video.path(), lead, marks };
}

// A round pointer that follows the mouse, since recordings show none.
function cursorScript() {
  addEventListener("DOMContentLoaded", () => {
    const dot = document.createElement("div");
    dot.style.cssText =
      "position:fixed;left:-40px;top:-40px;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(21,19,18,.55);border:2px solid #f5efe2;box-shadow:0 1px 4px rgba(0,0,0,.3);pointer-events:none;z-index:2147483647";
    document.body.appendChild(dot);
    addEventListener("mousemove", (e) => {
      dot.style.left = `${e.clientX}px`;
      dot.style.top = `${e.clientY}px`;
    });
    addEventListener("mousedown", () => (dot.style.transform = "scale(.7)"));
    addEventListener("mouseup", () => (dot.style.transform = ""));
  });
}

async function point(page: Page, el: Locator) {
  await el.scrollIntoViewIfNeeded();
  const b = (await el.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + Math.min(b.height / 2, 120), { steps: 14 });
  await sleep(350);
}

async function click(page: Page, el: Locator) {
  await point(page, el);
  await page.mouse.down();
  await sleep(90);
  await page.mouse.up();
}

/** A note on the page, for what happens off it (a new tab). */
async function toast(page: Page, text: string) {
  await page.evaluate((t) => {
    const d = document.createElement("div");
    d.textContent = t;
    d.style.cssText =
      "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);max-width:90vw;padding:12px 18px;border-radius:12px;background:#151312;color:#f5efe2;font:500 15px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25);z-index:2147483646";
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 3200);
  }, text);
}

const upcoming = (page: Page) =>
  page.locator("section", { has: page.getByRole("heading", { name: "Upcoming", exact: true }) }).locator(".upcoming-card");

async function desktop(page: Page, mark: (label: string) => void) {
  mark("desktop: landing");
  await sleep(1000);
  mark("Upcoming cards");
  await scrollToShow(page, page.getByRole("heading", { name: "Upcoming", exact: true }), 40, 1100);
  await sleep(700);
  const withRsvp = upcoming(page).filter({ has: page.locator("a[data-link-kind]") }).first();
  const card = (await withRsvp.count()) ? withRsvp : upcoming(page).first();
  await point(page, card.locator(".aspect-\\[4\\/5\\]"));
  await sleep(1300);
  mark("Past events");
  await scrollToShow(page, page.getByRole("heading", { name: "Past events" }), 120, 1000);
  await sleep(1800);

  await scrollToShow(page, page.getByRole("heading", { name: "Upcoming", exact: true }), 40, 900);
  mark("click: an Upcoming card");
  await click(page, card.locator(".aspect-\\[4\\/5\\]"));
  await page.waitForURL(/\/calendar\/events\//);
  await settle(page);
  mark("event page: cover left, details and RSVP right");
  await sleep(2200);

  const rsvp = page.locator("a[data-link-kind=rsvp], a[data-link-kind=form]").first();
  if (await rsvp.count()) {
    await point(page, rsvp);
    await sleep(500);
    mark("click: RSVP, which opens a new tab");
    const [popup] = await Promise.all([page.context().waitForEvent("page"), click(page, rsvp)]);
    let where = (await rsvp.getAttribute("href"))!;
    try {
      await popup.waitForURL(/^https?:/, { timeout: 8000 });
      where = popup.url();
    } catch {
      // Offline: the link's own address will do.
    }
    await popup.close();
    const u = new URL(where);
    await toast(page, `The RSVP form opened in a new tab (${u.host}${u.pathname.slice(0, 24)}…). This page stays open.`);
    await sleep(3000);
  } else {
    console.warn("warning: no Upcoming event with an RSVP form; the new-tab step is skipped");
  }

  mark("click: Back to the calendar");
  await scrollTo(page, 0, 500);
  await click(page, page.getByRole("link", { name: "Back to the calendar" }));
  await page.waitForURL(/\/calendar(\?|$)/);
  await settle(page);
  await sleep(1300);
  for (let i = 0; i < 2; i++) {
    const before = page.url();
    mark("click: Previous month");
    await click(page, page.getByRole("button", { name: "Previous month" }));
    await page.waitForURL((u) => u.toString() !== before);
    await settle(page);
    await sleep(700);
  }
  // The grid's cells open their day; the phone list under it is hidden here.
  const cells = page.locator("main a[href*='view=day']:visible");
  const niya = cells.filter({ hasText: /Niya Summit/ }).first();
  mark("click: a day with a passed event");
  await click(page, (await niya.count()) ? niya : cells.filter({ hasText: /[A-Za-z]{3}/ }).first());
  await page.waitForURL(/view=day/);
  await settle(page);
  await sleep(1300);
  const links = page.locator("main a[href^='/calendar/events/']:visible");
  const past = links.filter({ hasText: /Niya Summit/ }).first();
  mark("click: a passed event");
  await click(page, (await past.count()) ? past : links.first());
  await page.waitForURL(/\/calendar\/events\//);
  await settle(page);
  mark("passed event: no RSVP");
  await sleep(2600);
}

async function phone(page: Page, mark: (label: string) => void) {
  mark("phone: landing");
  await sleep(700);
  mark("Upcoming cards, stacked");
  const cards = upcoming(page);
  for (let i = 0; i < Math.min(await cards.count(), 3); i++) {
    await scrollToShow(page, cards.nth(i), 70, 900);
    await sleep(900);
  }
  mark("Past events");
  await scrollToShow(page, page.getByRole("heading", { name: "Past events" }), 70, 900);
  await sleep(1500);
  const noFlyer = page
    .getByRole("region", { name: "Past events" })
    .locator(".event-list-card")
    .filter({ has: page.locator("[data-fallback-cover]") })
    .first();
  if (await noFlyer.count()) {
    mark("tap: an event without a flyer");
    await tap(page, noFlyer);
    await page.waitForURL(/\/calendar\/events\//);
    await settle(page);
    mark("its fallback cover");
    await sleep(2200);
  } else {
    console.warn("warning: no past event without a flyer");
  }

  mark("tap: Back to the calendar");
  await tap(page, page.getByRole("link", { name: "Back to the calendar" }));
  await page.waitForURL(/\/calendar(\?|$)/);
  await settle(page);
  await sleep(600);
  mark("month timeline");
  await scrollToShow(page, page.locator("#month-agenda-heading"), 70, 1000);
  await sleep(1600);
  const days = page.locator(".timeline__day h3 a:visible");
  const dayLink = (await days.count()) > 1 ? days.nth(1) : days.first();
  mark("tap: a day");
  await tap(page, dayLink);
  await page.waitForURL(/view=day/);
  await settle(page);
  mark("day timeline with the prayer times");
  await sleep(1000);
  const firstCard = page.locator(".day-agenda .event-list-card").first();
  if (await firstCard.count()) {
    await scrollToShow(page, firstCard, 260, 1000);
    await sleep(1300);
    mark("tap: an event");
    await tap(page, firstCard);
    await page.waitForURL(/\/calendar\/events\//);
    await settle(page);
    mark("event page, stacked");
    await sleep(1400);
    await scrollTo(page, 520, 1300);
    await sleep(1800);
  }
}

/**
 * Loads the pages the demo can reach once, unrecorded, at both sizes, so the
 * server has the flyers resized before the takes (a cold next/image shows an
 * empty frame for a moment).
 */
async function warm(browser: Browser) {
  for (const [width, height, phone] of [[1280, 800, false], [390, 844, true]] as const) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 2,
      isMobile: phone,
      hasTouch: phone,
      timezoneId: "America/Los_Angeles",
    });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date(AT));
    const seen = new Set<string>();
    // The landing, this month with its days that have events, and Niya Summit's day.
    const queue = ["/", "/calendar", "/calendar?view=day&date=2026-08-29"];
    while (queue.length) {
      const url = queue.shift()!;
      if (seen.has(url)) continue;
      seen.add(url);
      await page.goto(BASE + url);
      await settle(page);
      for (let y = 0; y < (await page.evaluate(() => document.body.scrollHeight)); y += height) {
        await page.evaluate((top) => window.scrollTo(0, top), y);
        await sleep(300);
      }
      await page
        .waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 20000 })
        .catch(() => console.warn(`warning: images still loading on ${url}`));
      if (url.startsWith("/calendar/events/")) continue;
      const links = page.locator(url === "/calendar" ? "main a[href^='/calendar/events/'], .timeline__day h3 a" : "main a[href^='/calendar/events/']");
      queue.push(...(await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")!))));
    }
    console.log(`warmed ${seen.size} pages at ${width}px`);
    await context.close();
  }
}

async function main() {
  mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
  const tmp = mkdtempSync(path.join(os.tmpdir(), "ucscmsa-luma-"));
  const browser = await chromium.launch();
  await warm(browser);
  const d = await clip(browser, tmp, { width: 1280, height: 800 }, false, desktop);
  const p = await clip(browser, tmp, { width: 390, height: 844 }, true, phone);
  await browser.close();

  // Desktop scaled to 1080 high; the phone centred, 1080 high, on paper.
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-ss", d.lead.toFixed(2), "-i", d.webm,
    "-ss", p.lead.toFixed(2), "-i", p.webm,
    "-filter_complex",
    [
      `[0:v]fps=30,scale=1728:1080:flags=lanczos,pad=1920:1080:96:0:color=${PAPER},setsar=1[a]`,
      `[1:v]fps=30,scale=-2:1080:flags=lanczos,pad=1920:1080:(ow-iw)/2:0:color=${PAPER},setsar=1[b]`,
      "[a][b]concat=n=2:v=1:a=0[v]",
    ].join(";"),
    "-map", "[v]", "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", OUT,
  ]);
  rmSync(tmp, { recursive: true, force: true });
  console.log(`wrote ${OUT}`);
  const dEnd = d.marks.at(-1)![0];
  for (const [t, label] of d.marks) console.log(`${t.toFixed(1).padStart(5)}s  ${label}`);
  for (const [t, label] of p.marks) console.log(`${(t + dEnd).toFixed(1).padStart(5)}s  ${label}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
