/**
 * Short demo of the admin Events page and instant click feedback, desktop
 * then phone, as one 1920x1080 video. Desktop: search, the Past tab, a
 * filter, Cancel showing at once, and one forced failure rolling back with
 * the quiet line. Phone: an RSVP showing at once with "Saving…", a forced
 * failure rolling back, then the Events page with a filter.
 *
 *   bun scripts/admin-snappy-demo.ts --base http://localhost:3300 --out tmp/admin-snappy.mp4 \
 *     --token <admin session token> [--at 2026-10-21T14:00:00-07:00] [--latency 800]
 *
 * Meant for a local `next start` on a scratch copy of the public snapshot
 * with a fake admin session added, the server's clock at --at
 * (scripts/fake-now.cjs). Every Server Function call is held back by
 * --latency ms so the feedback is visible; the forced failures abort the
 * call in the browser, so the server never sees them. It does change the
 * scratch database: it cancels and uncancels one event and RSVPs once.
 */
import { chromium, type Browser, type Locator, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { arg, scrollToShow, settle, sleep, tap } from "./demo-kit";

const BASE = arg("base", "http://localhost:3300");
const OUT = arg("out", "tmp/ucscmsa-admin-snappy-demo.mp4");
const AT = arg("at", "2026-10-21T14:00:00-07:00");
const TOKEN = arg("token", "");
const LATENCY = Number(arg("latency", "800"));
const PAPER = "0xf5efe2";

type Mark = (label: string) => void;
type Clip = { webm: string; lead: number; marks: [number, string][] };

/** Every Server Function call waits LATENCY ms; `fail.next = true` aborts the next one. */
async function slowActions(page: Page) {
  const fail = { next: false };
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (req.method() !== "POST" || !req.headers()["next-action"]) return route.continue();
    await sleep(LATENCY);
    if (fail.next) {
      fail.next = false;
      return route.abort();
    }
    await route.continue();
  });
  return fail;
}

async function clip(
  browser: Browser,
  tmp: string,
  size: { width: number; height: number },
  phone: boolean,
  start: string,
  run: (page: Page, mark: Mark, fail: { next: boolean }) => Promise<void>,
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
  await context.addCookies([{ name: "authjs.session-token", value: TOKEN, url: BASE }]);
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(AT));
  if (!phone) await page.addInitScript(cursorScript);
  const fail = await slowActions(page);
  const t0 = Date.now();
  const marks: [number, string][] = [];
  await page.goto(BASE + start);
  await settle(page);
  await sleep(400);
  const lead = (Date.now() - t0) / 1000;
  const mark: Mark = (label) => marks.push([(Date.now() - t0) / 1000 - lead, label]);
  await run(page, mark, fail);
  mark("end");
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
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 14 });
  await sleep(300);
}

async function click(page: Page, el: Locator) {
  await point(page, el);
  await page.mouse.down();
  await sleep(90);
  await page.mouse.up();
}

/** The first upcoming row with a Cancel button (a whole event, not yet cancelled). */
async function cancellableRow(page: Page) {
  const row = page.locator(".admin-event").filter({ has: page.getByRole("button", { name: /^Cancel / }) }).first();
  const label = (await row.getByRole("button", { name: /^Cancel / }).getAttribute("aria-label"))!;
  return { row, title: label.replace(/^Cancel /, "") };
}

async function desktop(page: Page, mark: Mark, fail: { next: boolean }) {
  mark("desktop: Admin > Events, upcoming soonest first, grouped by date");
  await sleep(1800);
  const search = page.getByRole("searchbox", { name: "Search events" });
  mark("search: \"night\"");
  await click(page, search);
  await page.keyboard.type("night", { delay: 110 });
  await sleep(1800);
  await search.fill("");
  await sleep(600);
  mark("the Past tab, newest first");
  await click(page, page.getByRole("tab", { name: /^Past/ }));
  await sleep(1800);
  mark("filter: No flyer");
  await click(page, page.getByRole("button", { name: "No flyer", exact: true }));
  await sleep(1800);
  await click(page, page.getByRole("button", { name: "All", exact: true }));
  await click(page, page.getByRole("tab", { name: /^Upcoming/ }));
  await sleep(1000);

  const { row, title } = await cancellableRow(page);
  mark(`quick action: Cancel ${title}, the badge shows at once (${LATENCY} ms server delay)`);
  await click(page, row.getByRole("button", { name: `Cancel ${title}` }));
  await sleep(2200);
  mark("forced failure: Uncancel, the call is dropped, it rolls back with a quiet line");
  fail.next = true;
  await click(page, row.getByRole("button", { name: `Uncancel ${title}` }));
  await sleep(3200);
  mark("Uncancel again, saved");
  await click(page, row.getByRole("button", { name: `Uncancel ${title}` }));
  await sleep(2000);
}

/** An upcoming event that takes the site's own RSVPs (no organizers' form). */
async function rsvpEvent(page: Page) {
  const hrefs = await page
    .locator(".admin-event a[href^='/calendar/events/']")
    .evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
  for (const href of hrefs) {
    await page.goto(BASE + href);
    if (await page.getByRole("button", { name: "Going", exact: true }).count()) return href;
  }
  throw new Error("no upcoming event takes RSVPs on the site");
}

async function phone(page: Page, mark: Mark, fail: { next: boolean }) {
  mark("phone: an event page, RSVP");
  await sleep(1000);
  const box = page.locator("[aria-labelledby=rsvp-heading]");
  await scrollToShow(page, box, 140, 900);
  await sleep(800);
  mark(`tap Going: chosen at once, "Saving…" until the server has it`);
  await tap(page, page.getByRole("button", { name: "Going", exact: true }));
  await sleep(2200);
  mark("forced failure: tap Maybe, it rolls back to Going with a quiet line");
  fail.next = true;
  await tap(page, page.getByRole("button", { name: "Maybe", exact: true }));
  await sleep(3200);

  mark("Admin > Events on the phone");
  await page.goto(BASE + "/admin");
  await settle(page);
  await sleep(1400);
  mark("filter: Imported");
  await tap(page, page.getByRole("button", { name: "Imported", exact: true }));
  await sleep(1600);
  await scrollToShow(page, page.locator(".admin-event").nth(2), 200, 1100);
  await sleep(1600);
}

async function main() {
  if (!TOKEN) throw new Error("--token <admin session token> is required");
  mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
  const tmp = mkdtempSync(path.join(os.tmpdir(), "ucscmsa-snappy-"));
  const browser = await chromium.launch();
  // Find the RSVP event first, off camera, and warm the pages the clips load.
  const scout = await browser.newContext({ timezoneId: "America/Los_Angeles" });
  await scout.addCookies([{ name: "authjs.session-token", value: TOKEN, url: BASE }]);
  const sp = await scout.newPage();
  await sp.clock.setFixedTime(new Date(AT));
  await sp.goto(BASE + "/admin");
  const event = await rsvpEvent(sp);
  await scout.close();
  console.log(`RSVP event: ${event}`);

  const d = await clip(browser, tmp, { width: 1280, height: 800 }, false, "/admin", desktop);
  const p = await clip(browser, tmp, { width: 390, height: 844 }, true, event, phone);
  await browser.close();

  // Desktop scaled to 1080 high, then the phone centred, 1080 high, on paper.
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-ss", d.lead.toFixed(2), "-i", d.webm, "-ss", p.lead.toFixed(2), "-i", p.webm,
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
