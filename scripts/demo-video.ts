/**
 * ~30s phone demo of the site: landing → Upcoming → today's day agenda (Now
 * line, prayer markers, today's event) → year → month → another day's agenda →
 * an event page → a Jummah page.
 *
 *   bun scripts/demo-video.ts [--base https://ucscmsa.com] [--out ~/Movies/ucscmsa/ucscmsa-v2-demo.mp4]
 *     [--today 2026-10-21] [--date 2026-10-23] [--event "Laser Tag"] [--jummah "Jummah 1"]
 *
 * --today defaults to today in Santa Cruz; pass --jummah "" to end on the event page.
 * Read-only: it only loads pages and taps links (never sign-in, RSVP or admin),
 * so it is safe against production. Records a 390x844 touch phone, trims the
 * blank lead-in, and converts Playwright's webm to H.264 MP4 at 780x1688.
 * Prints each step's start time in the finished video.
 */
import os from "node:os";
import path from "node:path";
import { arg, dayCell, record, scrollTo, scrollToShow, settle, sleep, tap } from "./demo-kit";

const BASE = arg("base", "https://ucscmsa.com");
const OUT = arg("out", path.join(os.homedir(), "Movies/ucscmsa/ucscmsa-v2-demo.mp4"));
const TODAY = arg("today", new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }));
const DAY = arg("date", "2026-10-23");
const EVENT = arg("event", "Laser Tag");
const JUMMAH = arg("jummah", "Jummah 1");

async function main() {
  const { page, mark, startHere, finish } = await record(OUT);
  await page.goto(`${BASE}/`);
  await settle(page);
  await sleep(300);
  startHere();

  // 1. Landing, then down through Upcoming.
  mark("landing: logo and intro");
  await sleep(1500);
  mark("scroll to Upcoming");
  await scrollToShow(page, page.getByRole("heading", { name: "Upcoming" }), 60);
  await sleep(1800);

  // 2. Into the calendar, then today: the phone agenda with the Now line.
  const full = page.getByRole("link", { name: /See the full calendar/ });
  await scrollToShow(page, full, 500, 700);
  mark("tap: See the full calendar");
  await tap(page, full);
  await page.waitForURL(/\/calendar$/);
  await settle(page);
  await sleep(700);
  mark(`tap: ${TODAY} (today) in the month grid`);
  await tap(page, dayCell(page, TODAY));
  await page.waitForURL(/view=day/);
  await settle(page);
  mark("today's agenda: prayer markers, Now line, today's event");
  await sleep(1000);
  const nowLine = page.locator(".day-agenda__now");
  if (await nowLine.count()) await scrollToShow(page, nowLine, 280, 1200);
  else console.warn("warning: no Now line (is --today really today?)");
  await sleep(1900);

  // 3. Year, then down through a month into another day. On phones each
  // month in the year view is one tap target that opens the month view.
  await scrollTo(page, 0, 600);
  mark("tap: Year");
  await tap(page, page.getByRole("tab", { name: "year" }));
  await page.waitForURL(/view=year/);
  await settle(page);
  await sleep(900);
  const monthName = new Date(`${DAY}T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const monthCard = page.getByRole("link", { name: new RegExp(`^${monthName}, `) });
  await scrollToShow(page, monthCard, 300, 1100);
  await sleep(500);
  mark(`tap: ${monthName} in the year view`);
  await tap(page, monthCard);
  await page.waitForURL(/view=month/);
  await settle(page);
  await sleep(1300);
  mark(`tap: ${DAY} in the month grid`);
  await tap(page, dayCell(page, DAY));
  await page.waitForURL(/view=day/);
  await settle(page);
  mark("day agenda: Jummahs and the event");
  await sleep(1000);
  const eventCard = page.locator(".day-agenda").getByRole("link", { name: new RegExp(EVENT) });
  await scrollToShow(page, eventCard, 400, 1200);
  await sleep(1300);

  // 4. The event, then a Jummah page.
  mark(`tap: ${EVENT}`);
  await tap(page, eventCard);
  await page.waitForURL(/\/calendar\/events\//);
  await settle(page);
  mark("event page");
  await sleep(2400);
  if (JUMMAH) {
    await page.goBack();
    await settle(page);
    const jummah = page.locator(".day-agenda").getByRole("link", { name: new RegExp(JUMMAH) });
    await scrollToShow(page, jummah, 330, 700);
    mark(`tap: ${JUMMAH}`);
    await tap(page, jummah);
    await page.waitForURL(/\/calendar\/events\//);
    await settle(page);
    mark("Jummah page");
    await sleep(2200);
  }
  await finish();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
