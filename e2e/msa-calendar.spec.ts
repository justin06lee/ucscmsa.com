import { test, expect, type Page } from "@playwright/test";
import { seed, signIn } from "./fixtures";

// The MSA calendar switch, end to end against a stand-in Google over HTTP
// (scripts/fake-google-server.ts). Runs only when that's up and the app was
// started with its key file: E2E_FAKE_GOOGLE=http://localhost:3299.

const fake = process.env.E2E_FAKE_GOOGLE;
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
test.beforeEach(async ({ context, baseURL }) => {
  test.skip(!fake || !seed(), "needs E2E_FAKE_GOOGLE and the seeded session tokens");
  await signIn(context, baseURL!, "admin");
});

type LiveEvent = { id: string; summary: string; start: { date: string }; end: { date: string } };
const live = async (): Promise<LiveEvent[]> => (await fetch(`${fake}/_live`)).json();

function shortDate(days: number) {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric" });
}

async function makeTimeline(page: Page) {
  await page.goto("/admin/plan");
  await page.getByLabel("What are you planning?").fill("Bake sale fundraiser on campus");
  await page.getByRole("button", { name: "Make my timeline" }).click();
  await expect(page.getByTestId("plan-chat")).toContainText("When is the event?");
  await page.getByLabel("Your answer").fill(shortDate(30));
  await page.getByRole("button", { name: "Send" }).click();
  await page.waitForURL(/\/admin\/plan\/[^/]+$/);
  return (await page.getByRole("heading", { level: 1 }).innerText()).trim();
}

test("on the MSA calendar: added, renamed, moved, taken off, and gone with the timeline", async ({ page }) => {
  const before = (await live()).length;
  const title = await makeTimeline(page);
  const box = page.getByRole("checkbox", { name: "Put it on the MSA Google Calendar" });
  await expect(box).not.toBeChecked();

  await box.locator("xpath=..").click();
  await expect(box).toBeChecked();
  await expect(page.getByText("On it as an all-day event.")).toBeVisible();
  let mine = (await live()).filter((e) => e.summary === title);
  expect(mine).toHaveLength(1);
  const id = mine[0].id;

  await page.getByText("Rename or delete").click();
  await page.getByLabel("Name").fill(`${title} and chai`);
  await page.getByRole("button", { name: "Rename" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${title} and chai`);
  await expect.poll(async () => (await live()).find((e) => e.id === id)?.summary).toBe(`${title} and chai`);

  await page.getByRole("button", { name: "Change date" }).click();
  const newDate = new Date(Date.now() + 40 * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  await page.getByLabel("Event date").fill(newDate);
  await page.getByRole("button", { name: "Save date" }).click();
  await expect.poll(async () => (await live()).find((e) => e.id === id)?.start.date).toBe(newDate);

  await box.locator("xpath=..").click();
  await expect(box).not.toBeChecked();
  await expect.poll(async () => (await live()).some((e) => e.id === id)).toBe(false);

  // Back on, then the timeline is deleted: the event goes too, and it was the same event all along.
  await box.locator("xpath=..").click();
  await expect(box).toBeChecked();
  mine = (await live()).filter((e) => e.id === id);
  expect(mine).toHaveLength(1);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete timeline" }).click();
  await page.waitForURL(/\/admin\/plan$/);
  expect((await live()).some((e) => e.id === id)).toBe(false);
  expect((await live()).length).toBe(before);
});
