import { test, expect } from "@playwright/test";
import { seed, signIn } from "./fixtures";

// UI for events from the import API (docs/import.md). Fixtures from
// scripts/seed-local.ts: ev-potluck (imported from WhatsApp) and ev-cleanup
// (imported, then cancelled by the import), next to admin-made ev-gbm.

test("a cancelled event's page says so, offers no RSVP, and marks the JSON-LD", async ({ page }) => {
  const res = await page.goto("/calendar/events/ev-cleanup");
  expect(res?.status()).toBe(200);
  await expect(page).toHaveTitle(/^Cancelled: Beach Cleanup at Natural Bridges/);
  await expect(page.getByRole("status")).toHaveText("This event was cancelled.");
  await expect(page.getByRole("heading", { name: "RSVP" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /to RSVP/ })).toHaveCount(0);
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(ld.join("")).toContain("https://schema.org/EventCancelled");
});

test("an event that isn't cancelled keeps RSVP and EventScheduled", async ({ page }) => {
  await page.goto("/calendar/events/ev-potluck");
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "RSVP" })).toBeVisible();
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(ld.join("")).toContain("https://schema.org/EventScheduled");
});

test.describe("admin", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    test.skip(!seed(), "needs the seeded session tokens (E2E_SEED_FILE)");
    await signIn(context, baseURL!, "admin");
  });

  test("the event list marks imported and cancelled events", async ({ page }) => {
    await page.goto("/admin");
    const row = (title: string) => page.getByRole("row").filter({ hasText: title });
    await expect(row("Beach Cleanup at Natural Bridges")).toContainText("Imported from WhatsApp");
    await expect(row("Beach Cleanup at Natural Bridges")).toContainText("Cancelled");
    await expect(row("Community Potluck")).toContainText("Imported from WhatsApp");
    await expect(row("Community Potluck")).not.toContainText("Cancelled");
    await expect(row("Fall General Body Meeting")).not.toContainText("Imported");
  });

  test("the edit form explains the import and shows where it came from", async ({ page }) => {
    await page.goto("/admin/events/ev-potluck/edit");
    const origin = page.getByRole("region", { name: "Event origin" });
    await expect(origin).toContainText("Imported from WhatsApp");
    await expect(origin).toContainText("WhatsApp MSA Announcements, 2026-10-20 18:04");
    await expect(origin.getByRole("link")).toHaveCount(0);
    await expect(origin).toContainText("Saving your changes stops the WhatsApp import from overwriting this event.");

    await page.goto("/admin/events/ev-cleanup/edit");
    await expect(origin.getByRole("link", { name: "https://chat.whatsapp.com/example-announcements" })).toBeVisible();
    await expect(origin).toContainText(/Cancelled by the import on October 19, 2026 at 7:00 PM\./);

    await page.goto("/admin/events/ev-gbm/edit");
    await expect(origin).toHaveCount(0);
  });
});
