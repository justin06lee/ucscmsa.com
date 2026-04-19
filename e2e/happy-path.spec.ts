import { test, expect } from "@playwright/test";

test("landing renders logo and upcoming section", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("MSA at UCSC")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Upcoming" })).toBeVisible();
  await expect(page.getByRole("link", { name: /See the full calendar/i })).toBeVisible();
});

test("day view shows prayer line markers", async ({ page }) => {
  await page.goto("/calendar?view=day&date=2026-04-16");
  await expect(
    page.locator(".day-grid__prayer-label").filter({ hasText: /Fajr /i })
  ).toBeVisible();
});

test("admin page redirects unauthenticated visitors", async ({ page }) => {
  await page.goto("/admin");
  await page.waitForURL("**/");
});
