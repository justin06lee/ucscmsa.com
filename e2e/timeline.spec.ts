import { test, expect } from "@playwright/test";
import { seed, signIn } from "./fixtures";

// The Timeline planner, in its keyword-rules mode (playwright.config sets
// PLANNER_LLM=off): describe the event, answer the one question, land on a
// dated timeline, tick a step, share it, unshare it.

function shortDate(days: number) {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric" });
}

test.beforeEach(async ({ context, baseURL }) => {
  test.skip(!seed(), "needs the seeded session tokens (E2E_SEED_FILE)");
  await signIn(context, baseURL!, "admin");
});

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("chat to timeline: ask for the date, build it, tick, share, unshare", async ({ page, browser, baseURL }) => {
  await page.goto("/admin/plan");
  await expect(page.getByRole("heading", { name: "Timeline", level: 1 })).toBeVisible();
  const box = page.getByLabel("What are you planning?");
  await box.fill("A halaqa with pizza for about 30 people");
  await page.getByRole("button", { name: "Make my timeline" }).click();

  // No date given, so it asks for one.
  const chat = page.getByTestId("plan-chat");
  await expect(chat).toContainText("When is the event?");
  await page.getByLabel("Your answer").fill(shortDate(24));
  await page.getByRole("button", { name: "Send" }).click();

  await page.waitForURL(/\/admin\/plan\/[^/]+$/);
  const items = page.getByTestId("timeline-item");
  await expect(items.first()).toContainText("Event Proposal");
  expect(await items.count()).toBeGreaterThan(3);
  await expect(items.filter({ hasText: "Purchase Request" })).toHaveCount(1);
  for (const a of await page.locator('main a[href^="http"]').all()) {
    await expect(a).toHaveAttribute("target", "_blank");
    await expect(a).toHaveAttribute("rel", /noopener/);
  }

  // Tick the first step; it stays ticked after a reload.
  const first = page.getByRole("checkbox", { name: /^Done: / }).first();
  await first.locator("xpath=..").click(); // the input is sr-only; tap its label
  await expect(first).toBeChecked();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: /^Done: / }).first()).toBeChecked();
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth, "page scrolls sideways").toBeLessThanOrEqual(390);

  // Share it: the link opens signed out, read-only and kept out of search.
  await page.getByRole("checkbox", { name: "Anyone with the link can see this timeline" }).locator("xpath=..").click();
  const link = page.getByRole("textbox", { name: "Share link" });
  await expect(link).toHaveValue(/\/timeline\/[A-Za-z0-9_-]+$/);
  const shareUrl = await link.inputValue();
  const shared = new URL(shareUrl).pathname;

  const guest = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  const pub = await guest.newPage();
  const res = await pub.goto(shared);
  expect(res!.status()).toBe(200);
  await expect(pub.getByTestId("timeline-item").first()).toContainText("Event Proposal");
  await expect(pub.getByRole("checkbox")).toHaveCount(0);
  await expect(pub.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  // The overview lists it as public.
  await page.goto("/admin/plan");
  await expect(page.getByText("Public").first()).toBeVisible();

  // Unshare: the link stops working.
  await page.goBack();
  await page.getByRole("checkbox", { name: "Anyone with the link can see this timeline" }).locator("xpath=..").click();
  await expect(page.getByRole("checkbox", { name: "Anyone with the link can see this timeline" })).not.toBeChecked();
  expect((await pub.goto(shared))!.status()).toBe(404);
  await guest.close();
});

test("someone else's timeline is a 404", async ({ page }) => {
  // Admin pages stream behind app/admin/loading.tsx, so the status is already
  // sent; the not-found page is what shows.
  await page.goto("/admin/plan/not-a-real-timeline");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  expect((await page.request.get("/timeline/not-a-real-share-link")).status()).toBe(404);
});
