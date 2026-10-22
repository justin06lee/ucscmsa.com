// Full-page screenshots of every page at phone and tablet widths, for
// before/after comparisons. Run against a local server backed by the seeded
// local DB (scripts/seed-local.ts):
//
//   bun scripts/screenshots.ts --base http://localhost:3100 \
//     --out docs/screenshots/before --seed /tmp/ucscmsa-fe/seed.json
//
// Admin pages use the seeded admin session token as the Auth.js cookie.
//
// --set snapshot shoots the public pages of the public production snapshot
// (Backend's ~/work/snapshots on tenet) instead, by real event ids; no --seed.
// --at fixes the browser's clock, to match a server started with
// scripts/fake-now.cjs. --only takes a comma list of shot names.
import { chromium, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : fallback;
  if (!v) throw new Error(`missing --${name}`);
  return v;
}

const base = arg("base", "http://localhost:3100");
const out = arg("out");
const set = arg("set", "seed");
const at = process.argv.includes("--at") ? new Date(arg("at")) : null;
const only = process.argv.includes("--only") ? arg("only").split(",") : null;
const seed = (set === "seed" ? JSON.parse(readFileSync(arg("seed"), "utf8")) : {}) as {
  adminToken: string;
  memberToken: string;
  singleEventId: string;
  recurringEventId: string;
};
const widths = arg("widths", "375,390,768").split(",").map(Number);

type Shot = { name: string; path: string; as?: "admin" | "member" };

// Real events in the snapshot of 2026-10-22: Sisters' Game Night (flyer, an
// RSVP form), Laser Tag (start-only, flyer), Henna Tabling (no flyer), Niya
// Summit (past, two flyers, 12 hours long).
const snapshotShots: Shot[] = [
  { name: "landing", path: "/" },
  { name: "calendar-day-today", path: "/calendar?view=day&date=2026-10-21" },
  { name: "calendar-day", path: "/calendar?view=day&date=2026-10-23" },
  // Niya Summit, 8 AM to 8 PM: a long event, in the row above the day grid.
  { name: "calendar-day-long", path: "/calendar?view=day&date=2026-08-29" },
  { name: "calendar-month", path: "/calendar?view=month&date=2026-10-20" },
  { name: "calendar-year", path: "/calendar?view=year&date=2026-10-20" },
  { name: "event-game-night", path: "/calendar/events/01M5FP0HAZ8CFJ4R3CZH3X09AB" },
  { name: "event-laser-tag", path: "/calendar/events/01M5FNT8YERD4HRQNZ30N7CXZQ" },
  { name: "event-no-flyer", path: "/calendar/events/01M5GADPD79ZG7DTSZQ01KVM8Q" },
  { name: "event-past", path: "/calendar/events/01M5GADMMNZWCBETR7PS24C0M5" },
  { name: "login", path: "/login" },
  { name: "not-found", path: "/this-page-does-not-exist" },
];

const seedShots: Shot[] = [
  { name: "landing", path: "/" },
  { name: "calendar-month", path: "/calendar?view=month&date=2026-10-20" },
  { name: "calendar-day", path: "/calendar?view=day&date=2026-10-23" },
  { name: "calendar-year", path: "/calendar?view=year&date=2026-10-20" },
  { name: "event", path: `/calendar/events/${seed.singleEventId}` },
  { name: "event-recurring", path: `/calendar/events/${seed.recurringEventId}` },
  { name: "event-signed-in", path: `/calendar/events/${seed.singleEventId}`, as: "member" },
  { name: "login", path: "/login" },
  { name: "not-found", path: "/this-page-does-not-exist" },
  { name: "admin-events", path: "/admin", as: "admin" },
  { name: "admin-event-new", path: "/admin/events/new", as: "admin" },
  { name: "admin-event-edit", path: `/admin/events/${seed.recurringEventId}/edit`, as: "admin" },
  { name: "admin-admins", path: "/admin/admins", as: "admin" },
  { name: "admin-nominations", path: "/admin/nominations", as: "admin" },
  { name: "admin-event-flyers", path: "/admin/events/ev-panel/edit", as: "admin" },
  { name: "admin-plan", path: "/admin/plan", as: "admin" },
  { name: "admin-plan-event", path: "/admin/plan/ev-bonfire", as: "admin" },
  { name: "admin-playbook", path: "/admin/playbook", as: "admin" },
  { name: "admin-guide", path: "/admin/playbook/promotion", as: "admin" },
];

const shots = (set === "snapshot" ? snapshotShots : seedShots).filter((s) => !only || only.includes(s.name));

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  // Let entrance fades finish.
  await page.waitForTimeout(900);
}

async function main() {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const failures: string[] = [];
  for (const width of widths) {
    for (const s of shots) {
      const ctx = await browser.newContext({
        viewport: { width, height: 844 },
        deviceScaleFactor: 1,
        isMobile: width < 768,
        hasTouch: width < 768,
        timezoneId: "America/Los_Angeles",
      });
      if (s.as) {
        await ctx.addCookies([
          {
            name: "authjs.session-token",
            value: s.as === "admin" ? seed.adminToken : seed.memberToken,
            url: base,
          },
        ]);
      }
      const page = await ctx.newPage();
      if (at) await page.clock.setFixedTime(at);
      const res = await page.goto(base + s.path);
      await settle(page);
      const finalPath = new URL(page.url()).pathname;
      const expected = new URL(base + s.path).pathname;
      if (finalPath !== expected) {
        failures.push(`${s.name}@${width}: redirected to ${finalPath} (status ${res?.status()})`);
      }
      const file = path.join(out, `${s.name}-${width}.png`);
      await page.screenshot({ path: file, fullPage: true, animations: "disabled" });
      console.log(`${file}  ${res?.status()}`);
      await ctx.close();
    }
  }
  await browser.close();
  if (failures.length) {
    console.error("Pages that did not render where expected:\n" + failures.join("\n"));
    process.exitCode = 1;
  }
}

main();
