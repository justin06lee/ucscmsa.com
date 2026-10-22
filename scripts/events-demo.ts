/**
 * ~30s phone demo of the site's events: the landing (Upcoming cards with
 * flyers, then Past events) → an upcoming event: its flyer full screen and
 * its RSVP button → the calendar, back a few months through past events →
 * one of them, with its flyer and "This event has passed".
 *
 *   bun scripts/events-demo.ts [--base https://ucscmsa.com] [--out ~/Movies/ucscmsa/ucscmsa-events-demo.mp4]
 *     [--event "Sisters' Game Night"] [--back 3] [--past "Grappling Night"]
 *
 * --event names the Upcoming card to open (default: the first with a flyer).
 * --back is how many months to step back from this one, and --past names the
 * event to open in that month (default: the first with a flyer, else the
 * first). Read-only, like scripts/demo-video.ts: it only loads pages and taps
 * links; the RSVP button is shown, never followed.
 */
import os from "node:os";
import path from "node:path";
import { arg, record, scrollTo, scrollToShow, settle, sleep, tap } from "./demo-kit";

const BASE = arg("base", "https://ucscmsa.com");
const OUT = arg("out", path.join(os.homedir(), "Movies/ucscmsa/ucscmsa-events-demo.mp4"));
const EVENT = arg("event", "");
const BACK = Number(arg("back", "3"));
const PAST = arg("past", "");

async function main() {
  const { page, mark, startHere, finish } = await record(OUT);
  await page.goto(`${BASE}/`);
  await settle(page);
  await sleep(300);
  startHere();

  // 1. The landing: Upcoming cards with their flyers, then Past events.
  mark("landing");
  await sleep(1200);
  mark("Upcoming");
  await scrollToShow(page, page.getByRole("heading", { name: "Upcoming" }), 60, 1000);
  await sleep(1600);
  mark("Past events");
  await scrollToShow(page, page.getByRole("heading", { name: "Past events" }), 140, 1000);
  await sleep(1500);

  // 2. An upcoming event: its flyer, full screen, then its RSVP button.
  const cards = page.locator("section", { has: page.getByRole("heading", { name: "Upcoming" }) }).locator("li a");
  const card = (EVENT ? cards.filter({ hasText: EVENT }) : cards.filter({ has: page.locator("img") })).first();
  await scrollToShow(page, card, 200, 800);
  mark(`tap: ${(await card.locator(".font-medium").textContent())?.trim()}`);
  await tap(page, card);
  await page.waitForURL(/\/calendar\/events\//);
  await settle(page);
  await sleep(1300);
  const flyer = page.getByRole("button", { name: /^Open full screen/ });
  if (await flyer.count()) {
    mark("tap: the flyer, full screen");
    await tap(page, flyer);
    await page.getByRole("dialog").waitFor();
    await sleep(2200);
    await tap(page, page.getByRole("button", { name: "Close" }));
    await sleep(400);
  } else {
    console.warn("warning: this event has no flyer; pass --event");
  }
  const rsvp = page.locator("a[data-link-kind]").first();
  if (await rsvp.count()) {
    mark("the RSVP button");
    await scrollToShow(page, rsvp, 380, 900);
    await sleep(1800);
  } else {
    console.warn("warning: this event has no RSVP or form link; pass --event");
  }

  // 3. The calendar, back a few months through the history.
  await scrollTo(page, 0, 700);
  mark("tap: Back to calendar");
  await tap(page, page.getByRole("link", { name: "Back to calendar" }));
  await page.waitForURL(/\/calendar(\?|$)/);
  await settle(page);
  mark("this month");
  await sleep(800);
  for (let i = 1; i <= BACK; i++) {
    const before = page.url();
    mark(`tap: Previous (${i} of ${BACK})`);
    await tap(page, page.getByRole("button", { name: "Previous" }));
    await page.waitForURL((u) => u.toString() !== before);
    await settle(page);
    await sleep(800);
  }
  const heading = (await page.locator("#month-agenda-heading").textContent())!.trim();
  const list = page.getByRole("region", { name: heading });
  mark(`${heading}: the list`);
  await scrollToShow(page, list, 80, 1200);
  await sleep(1300);

  // 4. A past event from that month, with its flyer.
  const rows = list.locator("ul a");
  const past = (PAST ? rows.filter({ hasText: PAST }) : rows.filter({ has: page.locator("img") })).first();
  const row = (await past.count()) ? past : rows.first();
  await scrollToShow(page, row, 300, 800);
  mark(`tap: ${(await row.locator(".font-medium").textContent())?.trim()}`);
  await tap(page, row);
  await page.waitForURL(/\/calendar\/events\//);
  await settle(page);
  mark("past event page: This event has passed");
  await sleep(2600);
  await finish();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
