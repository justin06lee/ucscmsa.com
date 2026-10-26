import { test, expect, type Locator, type Page } from "@playwright/test";
import { seed, signIn } from "./fixtures";

test.beforeEach(async ({ context, baseURL }) => {
  test.skip(!seed(), "needs seeded sessions");
  await signIn(context, baseURL!, "admin");
});

/** The grip follows the pointer, so it can still sit beside the block typed
 * last. Wait until it is beside `block` before dragging it. */
async function gripBeside(page: Page, block: Locator) {
  const grip = page.locator('.bn-side-menu [draggable="true"]');
  await expect
    .poll(async () => {
      const [g, b] = await Promise.all([grip.boundingBox(), block.boundingBox()]);
      if (!g || !b) return false;
      const y = g.y + g.height / 2;
      return y >= b.y - 12 && y <= b.y + b.height + 12;
    })
    .toBe(true);
  return grip;
}

for (const width of [375, 1280]) {
  test(`visual blocks, subtasks and editable labeled links at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/admin/playbook");
    await page.getByRole("button", { name: "Add step", exact: true }).click();
    const title = `Visual room checklist ${width} ${crypto.randomUUID().slice(0, 6)}`;
    await page.getByLabel("Step title").fill(title);
    const editor = page.getByRole("textbox", {
      name: "What to do",
      exact: true,
    });
    await editor.fill("Choose a room");
    await editor.press("ControlOrMeta+a");
    await page.getByRole("button", { name: "Bold", exact: true }).click();
    await expect(editor.locator("strong")).toContainText("Choose a room");
    await page.getByLabel("Block style").selectOption("numberedListItem");
    await editor.press("ControlOrMeta+End");
    await editor.press("Enter");
    await page.keyboard.type("Send the proposal");
    await page
      .getByRole("button", { name: "+ Add a subtask", exact: true })
      .click();
    await page.keyboard.type("Ask the advisor ");
    await expect(
      editor.locator(".bn-block-group .bn-block-group"),
    ).toContainText("Ask the advisor");
    await page.getByRole("button", { name: "Link", exact: true }).click();
    await page.getByLabel("Link label").fill("Book a lounge");
    await page.getByLabel("Web address").fill("javascript:alert(1)");
    await page.getByRole("button", { name: "Save link", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Add link" })).toContainText(
      "Paste a full address",
    );
    await page
      .getByLabel("Web address")
      .fill("https://example.com/booking?room=lounge&group=msa");
    await page.getByRole("button", { name: "Save link", exact: true }).click();
    await editor
      .getByRole("link", { name: "Book a lounge", exact: true })
      .click();
    await expect(page.getByRole("dialog", { name: "Edit link" })).toBeVisible();
    await page.getByLabel("Link label").fill("Lounge booking form");
    await page.getByRole("button", { name: "Save link", exact: true }).click();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.getByRole("button", { name: "Save step", exact: true }).click();
    await expect(
      page.getByRole("button", { name: title, exact: true }),
    ).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: title, exact: true }).click();
    await expect(
      editor.locator(".bn-block-group .bn-block-group"),
    ).toContainText("Ask the advisor");
    await expect(
      editor.getByRole("link", { name: "Lounge booking form", exact: true }),
    ).toHaveAttribute(
      "href",
      "https://example.com/booking?room=lounge&group=msa",
    );
    await editor
      .locator(".bn-inline-content")
      .filter({ hasText: "Ask the advisor" })
      .click({ position: { x: 8, y: 8 } });
    await page.getByText("More", { exact: true }).click();
    await page
      .getByRole("button", { name: "Move out of subtask", exact: true })
      .click();
    await expect(editor.locator(".bn-block-group .bn-block-group")).toHaveCount(
      0,
    );
    await page.getByText("More", { exact: true }).click();
    await page
      .getByRole("button", { name: "Make a subtask", exact: true })
      .click();
    await expect(
      editor.locator(".bn-block-group .bn-block-group"),
    ).toContainText("Ask the advisor");
    await page.getByRole("button", { name: "Save step", exact: true }).click();
    await page.getByRole("button", { name: title, exact: true }).click();
    await expect(
      editor.locator(".bn-block-group .bn-block-group"),
    ).toContainText("Ask the advisor");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    const card = page
      .locator("[data-card]")
      .filter({ has: page.getByRole("button", { name: title, exact: true }) });
    await card.getByText("Read step", { exact: true }).click();
    await expect(card.locator("ol > li ul > li")).toContainText(
      "Ask the advisor",
    );
    await expect(
      card.getByRole("link", { name: /Lounge booking form/ }),
    ).toHaveAttribute("rel", "noopener noreferrer");
  });
}

test("reference guide replaces raw URLs with readable resource links", async ({
  page,
}) => {
  await page.goto("/admin/playbook/book-a-room");
  await expect(
    page.getByRole("link", { name: /Spaces directory/ }),
  ).toBeVisible();
  const links = page.locator("article a[href^='https://']");
  expect(await links.count()).toBeGreaterThan(3);
  for (const link of await links.all()) {
    expect(await link.innerText()).not.toMatch(/https?:\/\//);
    await expect(link).toHaveAttribute("target", "_blank");
  }
});

test("dragging a text block moves its content and survives a save", async ({
  page,
}) => {
  await page.goto("/admin/playbook");
  await page.getByRole("button", { name: "Add step", exact: true }).click();
  const title = `Block drag ${crypto.randomUUID().slice(0, 6)}`;
  await page.getByLabel("Step title").fill(title);
  const editor = page.getByRole("textbox", { name: "What to do", exact: true });
  await editor.fill("First block");
  await editor.press("End");
  await editor.press("Enter");
  await page.keyboard.type("Second block");
  await editor.press("Enter");
  await page.keyboard.type("Third block");
  const first = editor
    .locator(".bn-inline-content")
    .filter({ hasText: "First block" });
  const third = editor
    .locator(".bn-inline-content")
    .filter({ hasText: "Third block" });
  // The grip follows real pointer movement, so move within the block too.
  await first.hover();
  const box = await first.boundingBox();
  if (box) await page.mouse.move(box.x + 20, box.y + 5, { steps: 3 });
  const grip = await gripBeside(page, first);
  const target = await third.boundingBox();
  const from = await grip.boundingBox();
  if (!target || !from) throw new Error("Missing block target");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + 12, target.y + target.height - 1, {
    steps: 12,
  });
  await page.mouse.up();
  await expect(editor).toHaveText(
    /Second block[\s\S]*Third block[\s\S]*First block/,
  );
  await page.getByRole("button", { name: "Save step", exact: true }).click();
  await page.getByRole("button", { name: title, exact: true }).click();
  await expect(editor).toHaveText(
    /Second block[\s\S]*Third block[\s\S]*First block/,
  );
});

test("text blocks drag by touch, and a cancelled touch keeps the original order", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 960 });
  await page.goto("/admin/playbook");
  await page.getByRole("button", { name: "Add step", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "What to do", exact: true });
  await editor.fill("First block");
  await editor.press("End");
  await editor.press("Enter");
  await page.keyboard.type("Second block");
  await editor.press("Enter");
  await page.keyboard.type("Third block");
  const first = editor
    .locator(".bn-inline-content")
    .filter({ hasText: "First block" });
  const third = editor
    .locator(".bn-inline-content")
    .filter({ hasText: "Third block" });
  const cdp = await page.context().newCDPSession(page);
  async function drag(end: "touchCancel" | "touchEnd") {
    await first.scrollIntoViewIfNeeded();
    const tap = await first.boundingBox();
    if (!tap) throw new Error("Missing touch block");
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: tap.x + 12, y: tap.y + 12 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    const grip = await gripBeside(page, first);
    const a = await grip.boundingBox(),
      b = await third.boundingBox();
    if (!a || !b) throw new Error("Missing touch drag target");
    const x = a.x + a.width / 2,
      y = a.y + a.height / 2;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    for (let i = 1; i <= 10; i++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x: x + ((b.x + 12 - x) * i) / 10,
            y: y + ((b.y + b.height - 1 - y) * i) / 10,
          },
        ],
      });
    await cdp.send("Input.dispatchTouchEvent", { type: end, touchPoints: [] });
  }
  await drag("touchCancel");
  await expect(editor).toHaveText(
    /First block[\s\S]*Second block[\s\S]*Third block/,
  );
  await drag("touchEnd");
  await expect(editor).toHaveText(
    /Second block[\s\S]*Third block[\s\S]*First block/,
  );
});
