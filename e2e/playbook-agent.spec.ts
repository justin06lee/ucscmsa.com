import { test, expect } from "@playwright/test";
import { santaCruzDay, seed, signIn } from "./fixtures";

test.beforeEach(async ({ context, baseURL }) => {
  test.skip(!seed(), "needs seeded sessions");
  await signIn(context, baseURL!, "admin");
});

test("edit, keyboard reorder, delete and restore a playbook card", async ({
  page,
}) => {
  await page.goto("/admin/playbook");
  await page.getByRole("button", { name: "Add step", exact: true }).click();
  await page.getByLabel("Step title").fill("Keep the attendance log");
  await page.getByLabel("What to do").fill("Keep names and emails on the day.");
  await page.getByLabel("Lead time unit").selectOption("day-of");
  await page.getByRole("button", { name: "Save step", exact: true }).click();
  const card = page.locator("[data-card]").filter({
    has: page.getByRole("button", {
      name: "Keep the attendance log",
      exact: true,
    }),
  });
  await expect(card).toContainText("Day of");
  const id = await card.getAttribute("data-card");
  const before = await page
    .locator("[data-card]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-card")));
  await card
    .getByRole("button", { name: "Move Keep the attendance log", exact: true })
    .press("ArrowUp");
  await expect(page.getByRole("status")).toHaveText("Order saved.");
  await page.reload();
  const after = await page
    .locator("[data-card]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-card")));
  expect(after.indexOf(id)).toBe(before.indexOf(id) - 1);
  await card
    .getByRole("button", { name: "Keep the attendance log", exact: true })
    .click();
  await page.getByLabel("Step title").fill("Record attendance");
  await page.getByRole("button", { name: "Save step", exact: true }).click();
  await page
    .getByRole("button", { name: "Record attendance", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Version history", exact: true })
    .click();
  await expect(
    page
      .getByText("Keep the attendance log", { exact: true })
      .filter({ visible: true }),
  ).toHaveCount(0);
  // Show the earlier snapshot, then put it back as a new version.
  const snapshots = page.locator("form details").filter({
    has: page.getByRole("button", {
      name: "Restore this version",
      includeHidden: true,
    }),
  });
  await snapshots.last().locator("summary").click();
  await snapshots
    .last()
    .getByRole("button", { name: "Restore this version" })
    .click();
  await page
    .getByRole("button", { name: "Keep the attendance log", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete step", exact: true }).click();
  await expect(
    page.getByText("Delete this step?", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete step", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Keep the attendance log", exact: true }),
  ).toHaveCount(0);
  await page.getByText(/^Deleted steps/).click();
  await page
    .getByRole("button", { name: "Restore step", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("button", { name: "Keep the attendance log", exact: true }),
  ).toBeVisible();
});

test("pointer drag saves the new position; a failed move rolls back", async ({
  page,
}) => {
  await page.goto("/admin/playbook");
  const ids = await page
    .locator("[data-card]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-card")));
  const handle = page
    .locator("[data-card]")
    .first()
    .getByRole("button", { name: /^Move / });
  const a = await handle.boundingBox();
  const b = await page.locator("[data-card]").nth(1).boundingBox();
  if (!a || !b) throw new Error("missing drag target");
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole("status")).toHaveText("Order saved.");
  await page.reload();
  await expect(page.locator("[data-card]").nth(1)).toHaveAttribute(
    "data-card",
    ids[0]!,
  );
  const moved = page
    .locator(`[data-card="${ids[0]}"]`)
    .getByRole("button", { name: /^Move / });
  await page.route("**/admin/playbook", (route) =>
    route.request().headers()["next-action"]
      ? route.abort("failed")
      : route.continue(),
  );
  await moved.press("ArrowUp");
  await expect(
    page.getByRole("alert").filter({ hasText: "Couldn't reach the server" }),
  ).toBeVisible();
  await expect(page.locator("[data-card]").nth(1)).toHaveAttribute(
    "data-card",
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

test("touch drag works on a phone and pointer cancellation restores the order", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/admin/playbook");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const ids = await page
    .locator("[data-card]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-card")));
  const handle = page
    .locator("[data-card]")
    .first()
    .getByRole("button", { name: /^Move / });
  const a = await handle.boundingBox();
  const b = await page.locator("[data-card]").nth(1).boundingBox();
  if (!a || !b) throw new Error("missing touch target");
  const cdp = await page.context().newCDPSession(page);
  const x = a.x + a.width / 2;
  const y = a.y + a.height / 2;
  const targetX = b.x + b.width / 2;
  const targetY = b.y + 50;
  async function drag() {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    for (let i = 1; i <= 8; i++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x: x + ((targetX - x) * i) / 8, y: y + ((targetY - y) * i) / 8 },
        ],
      });
  }
  await drag();
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await expect(page.getByRole("status")).toHaveText("Move cancelled.");
  await expect(page.locator("[data-card]").first()).toHaveAttribute(
    "data-card",
    ids[0]!,
  );
  await drag();
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(page.getByRole("status")).toHaveText("Order saved.");
  await page.reload();
  await expect(page.locator("[data-card]").nth(1)).toHaveAttribute(
    "data-card",
    ids[0]!,
  );
});

test("the former lead-time page opens the playbook board", async ({ page }) => {
  await page.goto("/admin/plan/settings");
  await page.waitForURL("**/admin/playbook");
  await expect(
    page.getByRole("heading", { name: "Playbook", exact: true }),
  ).toBeVisible();
});
