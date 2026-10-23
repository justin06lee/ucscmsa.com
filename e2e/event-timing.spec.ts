import { test, expect, type Page } from "@playwright/test";
import { adminRow, seed, signIn } from "./fixtures";

// Events whose times weren't announced (scripts/seed-local.ts, dated relative
// to the seed and kept off the fixed fixtures' days): ev-date-only today with
// no times, ev-start-only a couple of days out at 6 PM with no end, ev-retreat
// a date-only weekend, and ev-past-date-only a few days back. None may show
// the stored 12:00 AM start or 11:59 PM end that stand in for unknown times.

const TZ = "America/Los_Angeles";
const ymd = (daysAhead: number) =>
  new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", { timeZone: TZ });
const STAND_INS = /12:00 AM|11:59 PM/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function eventLd(page: Page): Promise<Record<string, string>> {
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  return ld.map((s) => JSON.parse(s)).find((d) => d["@type"] === "Event");
}

/** The local day an event is on, from its page's JSON-LD. */
async function eventDay(page: Page, id: string): Promise<string> {
  await page.goto(`/calendar/events/${id}`);
  return (await eventLd(page)).startDate.slice(0, 10);
}

test("the landing shows a date-only event without a made-up time", async ({ page }) => {
  test.skip((await eventDay(page, "ev-date-only")) !== ymd(0), "the seed moved it off today, a fixture day");
  await page.goto("/");
  const card = page.getByRole("listitem").filter({ hasText: "Henna Night" });
  await expect(card).toContainText("Time not announced");
  await expect(page.getByRole("region", { name: "Past events" })).toContainText("Grappling Night");
  await expect(page.locator("main")).not.toContainText(STAND_INS);
});

test("event pages and their JSON-LD carry only the times that were announced", async ({ page, request }) => {
  await page.goto("/calendar/events/ev-date-only");
  await expect(page.getByText("Time not announced")).toBeVisible();
  await expect(page.locator("main")).not.toContainText(STAND_INS);
  let ld = await eventLd(page);
  expect(ld.startDate).toMatch(DATE);
  expect(ld).not.toHaveProperty("endDate");
  expect(await page.locator('meta[name="description"]').getAttribute("content")).not.toMatch(STAND_INS);
  const card = await request.get("/calendar/events/ev-date-only/opengraph-image");
  expect(card.status()).toBe(200);
  expect(card.headers()["content-type"]).toBe("image/png");

  await page.goto("/calendar/events/ev-start-only");
  await expect(page.getByText("Starts 6:00 PM")).toBeVisible();
  await expect(page.locator("main")).not.toContainText(STAND_INS);
  ld = await eventLd(page);
  expect(ld.startDate).toMatch(/^\d{4}-\d{2}-\d{2}T18:00:00-0[78]:00$/);
  expect(ld).not.toHaveProperty("endDate");

  await page.goto("/calendar/events/ev-retreat");
  ld = await eventLd(page);
  expect(ld.startDate).toMatch(DATE);
  expect(ld.endDate).toMatch(DATE);
  expect(Date.parse(ld.endDate) - Date.parse(ld.startDate)).toBe(2 * 24 * 60 * 60 * 1000);
  await expect(page.locator("main")).toContainText(" – ");
  await expect(page.getByText("Time not announced")).toBeVisible();

  await page.goto("/calendar/events/ev-past-date-only");
  await expect(page.getByRole("status")).toHaveText("This event has passed.");
  await expect(page.getByText("Time not announced")).toBeVisible();
});

test.describe("phones", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("the day agenda lists a date-only event first, above Fajr", async ({ page }) => {
    await page.goto(`/calendar?view=day&date=${await eventDay(page, "ev-date-only")}`);
    const items = page.locator(".day-agenda ol > li");
    await expect(items.first()).toContainText("Henna Night");
    await expect(items.first()).toContainText("Time not announced");
    const texts = await items.allInnerTexts();
    expect(texts.findIndex((t) => t.includes("Henna Night"))).toBeLessThan(texts.findIndex((t) => t.startsWith("Fajr")));
  });

  test("a start-only event shows its start and no end, in the day and month lists", async ({ page }) => {
    const day = await eventDay(page, "ev-start-only");
    await page.goto(`/calendar?view=day&date=${day}`);
    const item = page.locator(".day-agenda__item").filter({ hasText: "Laser Tag + Arcade Social" });
    await expect(item).toContainText("6:00 PM");
    await expect(item).not.toContainText("–");

    await page.goto(`/calendar?view=month&date=${day}`);
    const row = page.locator("li").filter({ hasText: "Laser Tag + Arcade Social" }).last();
    await expect(row).toContainText("6:00 PM");
    await expect(row).not.toContainText(/–|11:59/);
  });
});

test.describe("wide screens", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("the day grid has a row for a date-only event and an open-ended block for a start-only one", async ({ page }) => {
    await page.goto(`/calendar?view=day&date=${await eventDay(page, "ev-date-only")}`);
    await expect(page.locator(".day-grid__untimed")).toContainText("Henna Night");
    await expect(page.locator(".day-grid")).not.toContainText("Henna Night");

    await page.goto(`/calendar?view=day&date=${await eventDay(page, "ev-start-only")}`);
    const block = page.locator(".day-grid__event[data-open-end]");
    await expect(block).toContainText("Laser Tag + Arcade Social");
    await expect(block).toContainText("6:00 PM, end not announced");
  });

  test("month chips give no time for a date-only event", async ({ page }) => {
    await page.goto(`/calendar?view=month&date=${await eventDay(page, "ev-date-only")}`);
    const chip = page.locator("a > div.rounded-md").filter({ hasText: "Henna Night" });
    await expect(chip).toHaveText("Henna Night");
  });
});

test.describe("admin", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    test.skip(!seed(), "needs the seeded session tokens (E2E_SEED_FILE)");
    await signIn(context, baseURL!, "admin");
  });

  test("the list and the form leave unknown times blank", async ({ page }) => {
    await expect(await adminRow(page, "Henna Night")).toContainText("Time not announced");
    await expect(await adminRow(page, "Laser Tag + Arcade Social")).toContainText("6:00 PM");

    await page.goto("/admin/events/ev-date-only/edit");
    await expect(page.locator('input[name="startTime"]')).toHaveValue("");
    await expect(page.locator('input[name="endTime"]')).toHaveValue("");
    await page.goto("/admin/events/ev-start-only/edit");
    await expect(page.locator('input[name="startTime"]')).toHaveValue("18:00");
    await expect(page.locator('input[name="endTime"]')).toHaveValue("");
    // An optional time can be cleared again.
    await page.getByRole("button", { name: "Clear start time" }).click();
    await expect(page.locator('input[name="startTime"]')).toHaveValue("");
  });
});
