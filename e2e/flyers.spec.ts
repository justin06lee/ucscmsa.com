import { test, expect, type Page } from "@playwright/test";

// Flyers, links, add to calendar and share on the event page. Fixtures from
// scripts/seed-local.ts: ev-date-only (Henna Night, today, date-only, three
// flyers, a form left as "Form"), ev-panel (RSVP plus a Volunteer sign-up),
// ev-start-only (Laser Tag, start-only, a landscape flyer, a map link) and
// ev-past-01 (over, with an RSVP link that must not show).

const HENNA = "/calendar/events/ev-date-only";
const LASER = "/calendar/events/ev-start-only";
const PANEL = "/calendar/events/ev-panel";
const PAST = "/calendar/events/ev-past-01";

const viewer = (page: Page) => page.getByRole("dialog", { name: "Henna Night flyers" });

test.describe("flyer viewer", () => {
  test("keyboard: opens from the flyer, steps with arrows, Esc closes and gives focus back", async ({ page }) => {
    await page.goto(HENNA);
    const hero = page.getByRole("button", { name: "Open full screen: Henna Night flyer, 1 of 3" });
    await expect(hero.getByRole("img")).toHaveAttribute("loading", "eager");
    await hero.focus();
    await page.keyboard.press("Enter");

    await expect(viewer(page)).toBeVisible();
    await expect(viewer(page).getByRole("button", { name: "Close" })).toBeFocused();
    await expect(viewer(page).getByText("1 / 3")).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(viewer(page).getByText("2 / 3")).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(viewer(page).getByText("3 / 3")).toBeVisible();
    await expect(viewer(page).getByRole("button", { name: "Next flyer" })).toBeDisabled();
    await page.keyboard.press("ArrowLeft");
    await expect(viewer(page).getByText("2 / 3")).toBeVisible();

    const zoom = viewer(page).getByRole("button", { name: "Zoom in" });
    await expect(zoom).toHaveAttribute("aria-pressed", "false");
    await zoom.click();
    await expect(viewer(page).getByRole("button", { name: "Zoom out" })).toHaveAttribute("aria-pressed", "true");

    await page.keyboard.press("Escape");
    await expect(viewer(page)).toBeHidden();
    await expect(hero).toBeFocused();
    // The page scrolls again once the viewer is gone (the lock lifts in an
    // effect cleanup, which can land just after focus returns).
    await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow)).toBe("");
  });

  test("a thumbnail opens its own flyer; the close button closes", async ({ page }) => {
    await page.goto(HENNA);
    await page.getByRole("button", { name: "Open flyer 3 of 3 full screen" }).click();
    await expect(viewer(page).getByText("3 / 3")).toBeVisible();
    await viewer(page).getByRole("button", { name: "Close" }).click();
    await expect(viewer(page)).toBeHidden();
  });

  test("mouse: dragging the flyer down closes it", async ({ page }) => {
    await page.goto(HENNA);
    await page.getByRole("button", { name: /^Open full screen/ }).click();
    const box = (await viewer(page).getByRole("img", { name: "Henna Night flyer, 1 of 3" }).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3 + 200, { steps: 8 });
    await page.mouse.up();
    await expect(viewer(page)).toBeHidden();
  });

  test.describe("touch", () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test("swipe sideways to the next flyer, pull down to close", async ({ page }) => {
      await page.goto(HENNA);
      await page.getByRole("button", { name: /^Open full screen/ }).tap();
      await expect(viewer(page).getByText("1 / 3")).toBeVisible();

      const cdp = await page.context().newCDPSession(page);
      const touch = async (from: [number, number], to: [number, number]) => {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from[0], y: from[1] }] });
        for (let i = 1; i <= 10; i++) {
          const x = from[0] + ((to[0] - from[0]) * i) / 10;
          const y = from[1] + ((to[1] - from[1]) * i) / 10;
          await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
        }
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      };

      await touch([320, 420], [60, 425]);
      await expect(viewer(page).getByText("2 / 3")).toBeVisible();
      await touch([195, 300], [198, 560]);
      await expect(viewer(page)).toBeHidden();
    });
  });
});

test.describe("event links", () => {
  test("the RSVP is one clear button; other links sit below it; all open in a new tab", async ({ page }) => {
    await page.goto(PANEL);
    const rsvp = page.locator("a[data-link-kind=rsvp]");
    await expect(rsvp).toHaveText(/^RSVP/);
    // In the RSVP box, in the site's primary button style.
    await expect(page.getByRole("region", { name: "RSVP" }).locator("a[data-link-kind=rsvp]")).toBeVisible();
    await expect(rsvp).toHaveClass(/bg-ink/);
    await expect(rsvp).toHaveAttribute("href", "https://forms.gle/example-panel");
    const volunteer = page.locator("a[data-link-kind=signup]");
    await expect(volunteer).toHaveText(/^Volunteer/);
    for (const link of [rsvp, volunteer]) {
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow ugc");
    }
    // The event's own button replaces the site's RSVP: one RSVP on the page.
    await expect(page.locator("a[data-link-kind=rsvp], a[data-link-kind=form]")).toHaveCount(1);
    await expect(page.getByRole("link", { name: /Sign in with UCSC to RSVP/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^(Going|Maybe|Can.t go)/ })).toHaveCount(0);
  });

  test("a form left with its default label reads RSVP", async ({ page }) => {
    await page.goto(HENNA);
    const form = page.locator("a[data-link-kind=form]");
    await expect(form).toHaveText(/^RSVP/);
    await expect(form).toHaveAttribute("href", "https://forms.gle/example-henna");
  });

  test("a map link becomes the location's link", async ({ page }) => {
    await page.goto(LASER);
    const place = page.getByRole("link", { name: /^Santa Cruz Beach Boardwalk Open the map \(opens in a new tab\)$/ });
    await expect(place).toHaveAttribute("target", "_blank");
    await expect(place).toHaveAttribute("href", "https://maps.app.goo.gl/exampleBoardwalk");
    await expect(page.locator("a[data-link-kind=map]")).toHaveCount(0);
  });

  test("a past event shows no RSVP and nothing to add to a calendar", async ({ page }) => {
    await page.goto(PAST);
    await expect(page.getByRole("status")).toContainText("This event has passed.");
    await expect(page.locator("a[data-link-kind]")).toHaveCount(0);
    await expect(page.getByText("Add to calendar")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Share" })).toBeVisible();
    // Its flyer still shows.
    await expect(page.getByRole("img", { name: "Game Night flyer" })).toBeVisible();
  });
});

test.describe("add to calendar", () => {
  test("a date-only event downloads as an all-day event", async ({ page, request }) => {
    await page.goto(HENNA);
    await page.getByText("Add to calendar").click();
    const ics = page.getByRole("link", { name: "Apple / Outlook (.ics)" });
    await expect(ics).toHaveAttribute("download", "");
    const res = await request.get((await ics.getAttribute("href"))!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("text/calendar; charset=utf-8");
    expect(res.headers()["content-disposition"]).toBe('attachment; filename="Henna-Night.ics"');
    const body = await res.text();
    expect(body).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(body).toMatch(/\r\nDTSTART;VALUE=DATE:\d{8}\r\n/);
    expect(body).toMatch(/\r\nDTEND;VALUE=DATE:\d{8}\r\n/);
    expect(body).toContain("\r\nSUMMARY:Henna Night\r\n");
    expect(body).toContain("\r\nLOCATION:Cowell College\r\n");

    const google = page.getByRole("link", { name: /Google Calendar/ });
    await expect(google).toHaveAttribute("target", "_blank");
    const url = new URL((await google.getAttribute("href"))!);
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("Henna Night");
    expect(url.searchParams.get("dates")).toMatch(/^\d{8}\/\d{8}$/);
  });

  test("a start-only event has a start and no made-up end", async ({ request }) => {
    const res = await request.get(`${LASER}/event.ics`);
    const body = await res.text();
    expect(body).toMatch(/\r\nDTSTART:\d{8}T\d{6}Z\r\n/);
    expect(body).not.toContain("DTEND");
  });

  test("an unknown event is a 404", async ({ request }) => {
    expect((await request.get("/calendar/events/no-such-event/event.ics")).status()).toBe(404);
  });
});

test.describe("share", () => {
  test("uses the phone's share sheet when there is one", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { shared?: ShareData };
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (data: ShareData) => {
          w.shared = data;
        },
      });
    });
    await page.goto(PANEL);
    await page.getByRole("button", { name: "Share" }).click();
    const shared = await page.evaluate(() => (window as unknown as { shared?: ShareData }).shared);
    expect(shared).toEqual({ title: "Islamic Awareness Week: Faith on Campus Panel", url: page.url() });
    await expect(page.getByText("Link copied")).toHaveCount(0);
  });

  test("falls back to copying the link, and says so", async ({ page, context, baseURL }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    });
    await page.goto(PANEL);
    await page.getByRole("button", { name: "Share" }).click();
    await expect(page.getByRole("status")).toHaveText("Link copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
  });
});

test.describe("no layout shift", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  for (const path of ["/", HENNA, LASER, PANEL]) {
    test(`${path} loads without shifting`, async ({ page }) => {
      await page.addInitScript(() => {
        const w = window as unknown as { cls: number };
        w.cls = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
            if (!e.hadRecentInput) w.cls += e.value;
          }
        }).observe({ type: "layout-shift", buffered: true });
      });
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);
      const cls = await page.evaluate(() => (window as unknown as { cls: number }).cls);
      expect(cls).toBeLessThan(0.02);
    });
  }
});
