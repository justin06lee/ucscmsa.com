import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { signIn } from "./fixtures";

// The WhatsApp sync, through the real import API (docs/import.md), landing in
// the site's layouts: a card on the landing, the event page, the calendar and
// the admin list. Flyers: the seed's imported Laser Tag event, in paper-jungle.spec.

const TOKEN = "e2e-import-token-not-a-real-secret-0123456789";
const SOURCE_ID = "wa:e2e-layout-check";

function ymdIn(days: number) {
  const d = new Date(Date.now() + days * 86400000);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

async function send(request: APIRequestContext, operation: Record<string, unknown>) {
  const res = await request.post("/api/import/events", {
    headers: { Authorization: `Bearer ${TOKEN}` },
    data: { source: "whatsapp", operations: [{ sourceId: SOURCE_ID, ...operation }] },
  });
  expect(res.status(), await res.text()).toBeLessThan(300);
  return (await res.json()).results[0] as { eventId: string; status: string };
}

const upcomingCard = (page: Page, title: string) =>
  page.locator(".upcoming-card").filter({ hasText: title });

test("an announcement lands in every layout, updates in place and cancels cleanly", async ({ page, request, context, baseURL }) => {
  test.setTimeout(90_000);
  const date = ymdIn(1);
  const event = { date, startTime: "18:00", endTime: "19:30", location: "Stevenson 175" };

  const created = await send(request, {
    op: "upsert",
    sourceRef: "WhatsApp MSA Announcements, e2e",
    event: { ...event, title: "Sync Check Dinner" },
  });
  expect(created.eventId).toBeTruthy();

  // The landing's card, on phone width: title, time and place, its plain cover.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const card = upcomingCard(page, "Sync Check Dinner");
  await expect(card).toBeVisible();
  await expect(card).toContainText("6:00 PM");
  await expect(card).toContainText("Stevenson 175");
  await expect(card.locator("[data-fallback-cover]")).toHaveCount(1);

  // Its page, and the calendar's month on a laptop.
  await page.goto(`/calendar/events/${created.eventId}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sync Check Dinner");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/calendar?view=day&date=${date}`);
  await expect(page.getByText("Sync Check Dinner").locator("visible=true").first()).toBeVisible();

  // The same announcement again, edited: the same event, not a second one.
  const updated = await send(request, { op: "upsert", event: { ...event, title: "Sync Check Supper" } });
  expect(updated.eventId).toBe(created.eventId);
  await page.goto("/");
  await expect(upcomingCard(page, "Sync Check Supper")).toHaveCount(1);
  await expect(upcomingCard(page, "Sync Check Dinner")).toHaveCount(0);

  // The admin list marks where it came from.
  await signIn(context, baseURL!, "admin");
  await page.goto("/admin");
  const row = page.locator(`.admin-event[data-event-id="${created.eventId}"]`);
  await expect(row).toContainText("Sync Check Supper");
  await expect(row).toContainText(/WhatsApp/);

  // Cancelled: off the landing, and its page says so.
  await send(request, { op: "cancel" });
  await page.goto("/");
  await expect(upcomingCard(page, "Sync Check Supper")).toHaveCount(0);
  await page.goto(`/calendar/events/${created.eventId}`);
  await expect(page.getByRole("status")).toHaveText("This event was cancelled.");
});
