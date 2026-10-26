import { test, expect } from "@playwright/test";
import { santaCruzDay, seed, signIn } from "./fixtures";

test.beforeEach(async ({ context, baseURL }) => {
  test.skip(!seed(), "needs seeded sessions");
  await signIn(context, baseURL!, "admin");
});

test("categories, numbered steps, edit-mode reorder, delete and restore", async ({
  page,
}) => {
  await page.goto("/admin/playbook");
  await expect(
    page.getByRole("heading", { name: "Playbook", exact: true }),
  ).toBeVisible();
  for (const name of ["Hold an event", "Get funding", "Book a room"])
    await expect(page.getByRole("link", { name: new RegExp(`^${name}`) })).toBeVisible();
  // Nothing moves in view mode.
  await expect(page.locator('[draggable="true"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Move / })).toHaveCount(0);

  await page.getByRole("link", { name: /^Hold an event/ }).click();
  await page.waitForURL("**/admin/playbook/task/every");
  await expect(page.locator("[data-step]").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Move / })).toHaveCount(0);

  await page.getByRole("button", { name: "Edit steps", exact: true }).click();
  await page.getByRole("button", { name: "Add a step", exact: true }).click();
  await page.getByLabel("Step title").fill("Keep the attendance log");
  await page.getByLabel("What to do").fill("Keep names and emails on the day.");
  await page.getByLabel("Lead time unit").selectOption("day-of");
  await page.getByRole("button", { name: "Save step", exact: true }).click();
  const step = page.locator("[data-step]").filter({
    has: page.getByRole("heading", { name: "Keep the attendance log", exact: true }),
  });
  await expect(step).toContainText("Day of");
  const id = await step.getAttribute("data-step");
  const before = await page
    .locator("[data-step]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-step")));
  await page
    .getByRole("button", { name: "Move “Keep the attendance log” up", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Order saved.");
  await page.reload();
  const after = await page
    .locator("[data-step]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-step")));
  expect(after.indexOf(id)).toBe(before.indexOf(id) - 1);

  await page.getByRole("button", { name: "Edit steps", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit “Keep the attendance log”", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete step", exact: true }).click();
  await expect(
    page.getByText("Delete this step?", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete step", exact: true }).click();
  await expect(step).toHaveCount(0);

  await page.goto("/admin/playbook");
  await page.getByText(/^Deleted steps/).click();
  const deleted = page.locator("details > div").filter({ hasText: "Keep the attendance log" });
  await deleted.getByRole("button", { name: "Restore step", exact: true }).click();
  await expect(deleted).toHaveCount(0);
  await page.goto("/admin/playbook/task/every");
  await expect(step).toBeVisible();
});

test("a failed move rolls back", async ({ page }) => {
  await page.goto("/admin/playbook/task/every");
  await page.getByRole("button", { name: "Edit steps", exact: true }).click();
  const ids = await page
    .locator("[data-step]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-step")));
  await page.route("**/admin/playbook/task/every", (route) =>
    route.request().headers()["next-action"]
      ? route.abort("failed")
      : route.continue(),
  );
  await page
    .locator("[data-step]")
    .first()
    .getByRole("button", { name: /^Move .* down$/ })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Couldn't reach the server" }),
  ).toBeVisible();
  await expect(page.locator("[data-step]").first()).toHaveAttribute(
    "data-step",
    ids[0]!,
  );
});


for (const width of [1280, 375])
  test(`description to private checklist at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin/plan");
    const day = santaCruzDay(18).ymd;
    await page
      .getByLabel("What are you planning?")
      .fill(`Iftar ${width}, ${day}, ~80 people, serving food, need a room`);
    await page
      .getByRole("button", { name: "Make a timeline", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Review your plan" }),
    ).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Suggested timeline" }),
    ).toContainText("Deadline has passed");
    await expect(
      page.getByRole("list", { name: "Suggested timeline" }),
    ).toContainText("File the Event Proposal");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page
      .getByRole("button", { name: "Save draft and checklist" })
      .click();
    await page.waitForURL(/\/admin\/plan\/[0-9A-Z]{26}$/);
    await expect(
      page.getByRole("heading", { name: `Iftar ${width}`, exact: true }),
    ).toBeVisible();
    const checklist = page.getByRole("list", { name: "Checklist" });
    await checklist
      .getByText("Book a room (after filing the proposal)", { exact: true })
      .click();
    await expect(
      checklist
        .locator('[data-state="done"]')
        .filter({ hasText: "Book a room" }),
    ).toBeVisible();
    await page.reload();
    await expect(
      checklist
        .locator('[data-state="done"]')
        .filter({ hasText: "Book a room" }),
    ).toBeVisible();
    const id = page.url().split("/").pop();
    expect((await page.request.get(`/calendar/events/${id}`)).status()).toBe(
      404,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  });

test("the former lead-time page opens the playbook", async ({ page }) => {
  await page.goto("/admin/plan/settings");
  await page.waitForURL("**/admin/playbook");
  await expect(
    page.getByRole("heading", { name: "Playbook", exact: true }),
  ).toBeVisible();
});
