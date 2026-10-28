import { createHmac } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { seed, signIn } from "./fixtures";

// Steps given to board members: Aisha (the seeded admin) gives a step of her
// timeline to Omar (the second admin), who sees and ticks it on My steps.
// Then Omar's email switch, the mute link from the emails, and the cron's lock.

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
test.beforeEach(() => {
  test.skip(!seed(), "needs the seeded session tokens (E2E_SEED_FILE)");
});

const SECRET = "e2e-only-not-a-real-secret"; // playwright.config's AUTH_SECRET
const muteToken = (userId: string) => createHmac("sha256", SECRET).update(`mute-step-emails:${userId}`).digest("base64url");

function shortDate(days: number) {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric" });
}

async function makeTimeline(page: Page) {
  await page.goto("/admin/plan");
  await page.getByLabel("What are you planning?").fill("A halaqa with pizza for about 30 people");
  await page.getByRole("button", { name: "Make my timeline" }).click();
  await expect(page.getByTestId("plan-chat")).toContainText("When is the event?");
  await page.getByLabel("Your answer").fill(shortDate(24));
  await page.getByRole("button", { name: "Send" }).click();
  await page.waitForURL(/\/admin\/plan\/[^/]+$/);
}

async function as(browser: Browser, baseURL: string, who: "admin" | "admin2") {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await signIn(context, baseURL, who);
  return { context, page: await context.newPage() };
}

test("give a step to another board member, who sees it and ticks it", async ({ browser, baseURL }) => {
  const aisha = await as(browser, baseURL!, "admin");
  const omar = await as(browser, baseURL!, "admin2");
  await makeTimeline(aisha.page);
  // Not connected in tests, so there's no calendar switch.
  await expect(aisha.page.getByRole("heading", { name: "MSA calendar" })).toHaveCount(0);

  const owner = aisha.page.getByRole("combobox", { name: /^Who does: / }).first();
  const step = (await owner.getAttribute("aria-label"))!.replace("Who does: ", "");
  await expect(owner).toHaveValue("");
  await owner.selectOption({ label: "Omar Farouk" });
  await expect(owner).toHaveValue("u-omar");
  await aisha.page.reload();
  await expect(aisha.page.getByRole("combobox", { name: `Who does: ${step}` })).toHaveValue("u-omar");

  await omar.page.goto("/admin/steps");
  const next = omar.page.getByRole("region", { name: "Next up" });
  await expect(next.getByTestId("my-step")).toHaveCount(1);
  await expect(next).toContainText(step);
  await expect(next).toContainText("from Aisha Karim");
  expect(await omar.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await next.getByRole("checkbox", { name: `Done: ${step}` }).locator("xpath=..").click();
  await omar.page.reload();
  await expect(omar.page.getByText("All your steps are done.")).toBeVisible();
  await omar.page.getByText("Done (1)").click();
  await expect(omar.page.getByRole("checkbox", { name: `Done: ${step}` })).toBeChecked();

  // Aisha sees it ticked on her timeline.
  await aisha.page.reload();
  await expect(aisha.page.getByRole("checkbox", { name: `Done: ${step}` })).toBeChecked();

  // Taken back: it leaves Omar's list.
  await aisha.page.getByRole("combobox", { name: `Who does: ${step}` }).selectOption({ label: "No one" });
  await expect(aisha.page.getByRole("combobox", { name: `Who does: ${step}` })).toHaveValue("");
  await omar.page.goto("/admin/steps");
  await expect(omar.page.getByText("No steps yet.")).toBeVisible();

  await aisha.context.close();
  await omar.context.close();
});

test("Omar can turn step emails off and on, and the mute link works signed out", async ({ browser, baseURL, request }) => {
  const omar = await as(browser, baseURL!, "admin2");
  await omar.page.goto("/admin/steps");
  const emails = omar.page.getByRole("checkbox", { name: "Email me about my steps" });
  await expect(emails).toBeChecked();
  await emails.locator("xpath=..").click();
  await expect(emails).not.toBeChecked();
  await omar.page.reload();
  await expect(emails).not.toBeChecked();
  await emails.locator("xpath=..").click();
  await expect(emails).toBeChecked();
  await omar.page.reload();
  await expect(emails).toBeChecked();

  // The link in an email: asks first, then mutes. No sign-in needed.
  const guest = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  const page = await guest.newPage();
  await page.goto(`/unsubscribe?u=u-omar&t=${muteToken("u-omar")}`);
  await expect(page.getByText("omar.farouk@ucsc.edu")).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await page.getByRole("button", { name: "Stop step emails" }).click();
  await page.waitForURL(/\/unsubscribe\?done=1$/);
  await expect(page.getByText("Done. You won’t get step emails any more.")).toBeVisible();
  await omar.page.reload();
  await expect(emails).not.toBeChecked();

  // A wrong link mutes no one.
  await page.goto(`/unsubscribe?u=u-aisha&t=${muteToken("u-omar")}`);
  await expect(page.getByText("This link doesn’t work.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop step emails" })).toHaveCount(0);

  // Mail apps' one-click unsubscribe (RFC 8058).
  const oneClick = `/api/notify/unsubscribe?u=u-omar&t=${muteToken("u-omar")}`;
  const ok = await request.post(oneClick, { form: { "List-Unsubscribe": "One-Click" } });
  expect(ok.status()).toBe(200);
  const bad = await request.post(`/api/notify/unsubscribe?u=u-aisha&t=${muteToken("u-omar")}`, {
    form: { "List-Unsubscribe": "One-Click" },
  });
  expect(bad.status()).toBe(400);

  // Back on, for other runs.
  await emails.locator("xpath=..").click();
  await expect(emails).toBeChecked();
  await guest.close();
  await omar.context.close();
});

test("the reminder cron only answers Vercel's secret", async ({ request }) => {
  expect((await request.get("/api/cron/reminders")).status()).toBe(401);
  expect((await request.get("/api/cron/reminders", { headers: { Authorization: "Bearer wrong" } })).status()).toBe(401);
  const res = await request.get("/api/cron/reminders?now=1", { headers: { Authorization: "Bearer e2e-cron-secret" } });
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ calendar: { ok: 0, failed: 0 }, reminders: "email is off" });
});
