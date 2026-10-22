import { test, expect, type Page } from "@playwright/test";
import { seed, signIn } from "./fixtures";

// The admin edit page's links and flyers, on ev-bakesale, which nothing else
// looks at: these tests change it (scripts/seed-local.ts gives it three
// flyers and no links). Uploads need the Blob store, which a local server
// doesn't have, so only the refusals are tested here.

const EDIT = "/admin/events/ev-bakesale/edit";
const PAGE = "/calendar/events/ev-bakesale";

test.beforeEach(async ({ context, baseURL }) => {
  test.skip(!seed(), "needs the seeded session tokens (E2E_SEED_FILE)");
  await signIn(context, baseURL!, "admin");
});

async function save(page: Page) {
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForURL(/\/admin$/);
}

test.describe("admin: event links", () => {
  test("add an RSVP and a donation link, see them on the event, then remove them", async ({ page }) => {
    // Five page loads and two saves: more than 30s on a cold dev server.
    test.slow();
    await page.goto(EDIT);
    const links = page.getByRole("group", { name: "Links" });
    await links.getByRole("button", { name: "Add a link" }).click();
    // The first link starts as the RSVP.
    await expect(links.getByRole("button", { name: "Link 1 kind" })).toHaveText("RSVP");
    await links.getByLabel("Link 1 URL").fill("https://forms.gle/bake-rsvp");

    await links.getByRole("button", { name: "Add a link" }).click();
    await links.getByRole("button", { name: "Link 2 kind" }).click();
    await page.getByRole("option", { name: "Donation" }).click();
    await expect(links.getByLabel("Link 2 label")).toHaveAttribute("placeholder", "Donate");
    await links.getByLabel("Link 2 label").fill("Give to the appeal");
    await links.getByLabel("Link 2 URL").fill("https://www.launchgood.com/bake-sale");
    await save(page);

    await page.goto(PAGE);
    await expect(page.locator("a[data-link-kind=rsvp]")).toHaveAttribute("href", "https://forms.gle/bake-rsvp");
    await expect(page.locator("a[data-link-kind=rsvp]")).toHaveText(/^RSVP/);
    await expect(page.locator("a[data-link-kind=donate]")).toHaveText(/^Give to the appeal/);

    // Back in the form: a default label shows blank, a custom one as written.
    await page.goto(EDIT);
    await expect(links.getByLabel("Link 1 label")).toHaveValue("");
    await expect(links.getByLabel("Link 2 label")).toHaveValue("Give to the appeal");
    await links.getByRole("button", { name: "Remove link 2" }).click();
    await links.getByRole("button", { name: "Remove link 1" }).click();
    await save(page);

    await page.goto(PAGE);
    await expect(page.locator("a[data-link-kind]")).toHaveCount(0);
    // With no RSVP link of its own, the site's RSVP is back.
    await expect(page.getByRole("heading", { name: "RSVP" })).toBeVisible();
  });

  test("a link that isn't http(s) is refused with a reason", async ({ page }) => {
    await page.goto(EDIT);
    const links = page.getByRole("group", { name: "Links" });
    await links.getByRole("button", { name: "Add a link" }).click();
    await links.getByLabel("Link 1 URL").fill("javascript:alert(1)");
    await page.getByRole("button", { name: "Save" }).click();
    // Scoped to the form: Next's route announcer is an alert too.
    await expect(page.locator("form").getByRole("alert")).toHaveText("Links must be full http:// or https:// URLs");
    await expect(page).toHaveURL(new RegExp(`${EDIT}$`));
  });
});

test.describe("admin: flyers", () => {
  const thumbs = (page: Page) =>
    page.getByRole("region", { name: "Flyers" }).locator("li img").evaluateAll((els) =>
      els.map((el) => (el as HTMLImageElement).src),
    );

  test("reorder, keep on cancel, remove: saved at once and shown on the event", async ({ page }) => {
    await page.goto(EDIT);
    const flyers = page.getByRole("region", { name: "Flyers" });
    const [a, b, c] = await thumbs(page);
    expect([a, b, c].every(Boolean)).toBe(true);
    await expect(flyers.getByRole("button", { name: "Move flyer 1 up" })).toBeDisabled();
    await expect(flyers.getByRole("button", { name: "Move flyer 3 down" })).toBeDisabled();

    await flyers.getByRole("button", { name: "Move flyer 1 down" }).click();
    await expect(flyers.getByRole("status")).toHaveText("Flyer moved to position 2.");
    expect(await thumbs(page)).toEqual([b, a, c]);

    // Cancelling the confirmation keeps it.
    page.once("dialog", (d) => d.dismiss());
    await flyers.getByRole("button", { name: "Remove flyer 3" }).click();
    expect(await thumbs(page)).toEqual([b, a, c]);

    page.once("dialog", (d) => {
      expect(d.message()).toBe("Remove flyer 3? It is deleted, not hidden.");
      return d.accept();
    });
    await flyers.getByRole("button", { name: "Remove flyer 3" }).click();
    await expect(flyers.getByRole("status")).toHaveText("Flyer removed.");
    expect(await thumbs(page)).toEqual([b, a]);

    await page.reload();
    expect(await thumbs(page)).toEqual([b, a]);
    await page.goto(PAGE);
    await expect(page.getByRole("button", { name: /^Open full screen/ }).getByRole("img")).toHaveAttribute("src", b);
    await expect(page.getByRole("button", { name: /^Open flyer \d of 2 full screen$/ })).toHaveCount(2);
  });

  test("uploads too big for the server are refused before sending", async ({ page }) => {
    await page.goto(EDIT);
    const flyers = page.getByRole("region", { name: "Flyers" });
    await flyers.getByLabel("Add flyers").setInputFiles({
      name: "huge.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.alloc(5 * 1024 * 1024),
    });
    await expect(flyers.getByRole("alert")).toHaveText(
      "huge.jpg is more than 4 MB. Use a smaller copy, such as a screenshot of it.",
    );
  });

  test("an upload without image storage set up says so", async ({ page }) => {
    test.skip(!!process.env.BLOB_READ_WRITE_TOKEN, "image storage is set up here");
    await page.goto(EDIT);
    const flyers = page.getByRole("region", { name: "Flyers" });
    // A 1×1 PNG.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      "base64",
    );
    await flyers.getByLabel("Add flyers").setInputFiles({ name: "flyer.png", mimeType: "image/png", buffer: png });
    await expect(flyers.getByRole("alert")).toHaveText("Image storage isn't set up");
  });
});
