/**
 * ~30s phone demo of the site's events: the landing (Upcoming, then Past
 * events) → this month's view and list → back a few months → a past event →
 * a date-only event ("Time not announced").
 *
 *   bun scripts/events-demo.ts [--base https://ucscmsa.com] [--out ~/Movies/ucscmsa/ucscmsa-events-demo.mp4]
 *     [--back 3] [--past "Grappling Night"] [--untimed "Henna Night"]
 *
 * --back is how many months to step back from this one. In that month, --past
 * names the past event to open (default: the first one with a time) and
 * --untimed the date-only one (default: the first "Time not announced" row).
 * Read-only, like scripts/demo-video.ts: it only loads pages and taps links.
 */
import os from "node:os";
import path from "node:path";
import { arg, record, scrollTo, scrollToShow, settle, sleep, tap } from "./demo-kit";

const BASE = arg("base", "https://ucscmsa.com");
const OUT = arg("out", path.join(os.homedir(), "Movies/ucscmsa/ucscmsa-events-demo.mp4"));
const BACK = Number(arg("back", "3"));
const PAST = arg("past", "");
const UNTIMED = arg("untimed", "");

async function main() {
  const { page, mark, startHere, finish } = await record(OUT);
  await page.goto(`${BASE}/`);
  await settle(page);
  await sleep(300);
  startHere();

  // 1. The landing goes straight from the wordmark to Upcoming, then Past events.
  mark("landing");
  await sleep(1500);
  mark("Upcoming");
  await scrollToShow(page, page.getByRole("heading", { name: "Upcoming" }), 60, 1100);
  await sleep(1700);
  mark("Past events");
  await scrollToShow(page, page.getByRole("heading", { name: "Past events" }), 140, 1100);
  await sleep(1900);

  // 2. This month: dots in the grid, the list below. Then back a few months.
  const full = page.getByRole("link", { name: /See the full calendar/ });
  await scrollToShow(page, full, 400, 600);
  mark("tap: See the full calendar");
  await tap(page, full);
  await page.waitForURL(/\/calendar$/);
  await settle(page);
  mark("this month: the grid and its list");
  await sleep(900);
  await scrollToShow(page, page.locator("#month-agenda-heading"), 100, 1200);
  await sleep(1300);
  await scrollTo(page, 0, 700);
  for (let i = 1; i <= BACK; i++) {
    const before = page.url();
    mark(`tap: Previous (${i} of ${BACK})`);
    await tap(page, page.getByRole("button", { name: "Previous" }));
    await page.waitForURL((u) => u.toString() !== before);
    await settle(page);
    await sleep(900);
  }
  const heading = (await page.locator("#month-agenda-heading").textContent())!.trim();
  const list = page.getByRole("region", { name: heading });
  mark(`${heading}: the list`);
  await scrollToShow(page, list, 80, 1300);
  await sleep(1200);

  // 3. A past event, then a date-only one, both from that month's list.
  const rows = list.locator("ul a");
  const pastRow = (PAST ? rows.filter({ hasText: PAST }) : rows.filter({ hasNotText: "Time not announced" })).first();
  const untimedRow = (UNTIMED ? rows.filter({ hasText: UNTIMED }) : rows.filter({ hasText: "Time not announced" })).first();
  const title = async (row: typeof rows) => (await row.locator(".font-medium").textContent())?.trim();

  await scrollToShow(page, pastRow, 300, 800);
  mark(`tap: ${await title(pastRow)}`);
  await tap(page, pastRow);
  await page.waitForURL(/\/calendar\/events\//);
  await settle(page);
  mark("past event page: This event has passed");
  await sleep(2300);

  await page.goBack();
  await settle(page);
  if (await untimedRow.count()) {
    await scrollToShow(page, untimedRow, 300, 800);
    mark(`tap: ${await title(untimedRow)}`);
    await tap(page, untimedRow);
    await page.waitForURL(/\/calendar\/events\//);
    await settle(page);
    mark("date-only event page: Time not announced");
    await sleep(2300);
  } else {
    console.warn(`warning: no date-only event in ${heading}; pass --untimed or another --back`);
  }
  await finish();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
