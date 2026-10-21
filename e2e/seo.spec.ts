import { test, expect, type Page } from "@playwright/test";
import { seed, signIn } from "./fixtures";

// Search and share metadata on every indexable page. The server is built with
// NEXT_PUBLIC_SITE_URL = the base URL (playwright.config.ts), so canonicals and
// og:urls point at the server under test; production gets https://ucscmsa.com.
// Fixtures: scripts/seed-local.ts.

const INDEXABLE = [
  "/",
  "/calendar",
  "/calendar/events/ev-gbm", // one-off
  "/calendar/events/ev-jummah", // weekly
  "/calendar/events/ev-potluck", // imported
];

// Read at once, so tags a page doesn't have (login has no canonical) are null
// rather than waited for.
async function head(page: Page) {
  return page.evaluate(() => {
    const meta = (sel: string) => document.querySelector(sel)?.getAttribute("content") ?? null;
    const canonicals = document.querySelectorAll('link[rel="canonical"]');
    return {
      title: document.title,
      description: meta('meta[name="description"]'),
      canonical: canonicals[0]?.getAttribute("href") ?? null,
      canonicalCount: canonicals.length,
      robots: meta('meta[name="robots"]'),
      ogTitle: meta('meta[property="og:title"]'),
      ogDescription: meta('meta[property="og:description"]'),
      ogUrl: meta('meta[property="og:url"]'),
      ogType: meta('meta[property="og:type"]'),
      ogImage: meta('meta[property="og:image"]'),
      twitterCard: meta('meta[name="twitter:card"]'),
      twitterImage: meta('meta[name="twitter:image"]'),
    };
  });
}

async function jsonLd(page: Page): Promise<Record<string, unknown>[]> {
  const bodies = await page.locator('script[type="application/ld+json"]').allTextContents();
  return bodies.map((b) => JSON.parse(b));
}

type EventLd = {
  name: string;
  startDate: string;
  endDate: string;
  eventStatus: string;
  eventAttendanceMode: string;
  location: { "@type": string; name: string; address: { addressLocality: string } };
  organizer: Record<string, unknown>;
};

const same = (a: string | null, b: string) => a !== null && new URL(a).href === new URL(b).href;

test("every indexable page has its own title, description, canonical and share card", async ({
  page,
  request,
  baseURL,
}) => {
  // Five pages and their share images; under `next dev` each compiles on
  // first visit.
  test.setTimeout(120_000);
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  for (const path of INDEXABLE) {
    await page.goto(path);
    const h = await head(page);
    expect(h.title, path).toBeTruthy();
    expect(h.description, path).toBeTruthy();
    expect(h.description!.length, path).toBeLessThanOrEqual(160);
    titles.add(h.title);
    descriptions.add(h.description!);

    expect(h.canonicalCount, path).toBe(1);
    expect(same(h.canonical, new URL(path, baseURL).href), `${path} canonical ${h.canonical}`).toBe(true);
    expect(h.robots, path).toBe("index, follow");

    expect(h.ogTitle, path).toBeTruthy();
    expect(h.ogDescription, path).toBe(h.description);
    expect(same(h.ogUrl, new URL(path, baseURL).href), path).toBe(true);
    expect(h.ogType, path).toBe("website");
    expect(h.twitterCard, path).toBe("summary_large_image");
    expect(h.twitterImage, path).toBe(h.ogImage);

    const img = await request.get(h.ogImage!);
    expect(img.status(), `${path} og:image ${h.ogImage}`).toBe(200);
    expect(img.headers()["content-type"], path).toMatch(/^image\/png/);
    expect((await img.body()).length, path).toBeGreaterThan(10_000);
  }
  expect(titles.size).toBe(INDEXABLE.length);
  expect(descriptions.size).toBe(INDEXABLE.length);
});

test("event pages share their own image; the rest share the site's", async ({ page }) => {
  await page.goto("/calendar/events/ev-gbm");
  expect((await head(page)).ogImage).toMatch(/\/calendar\/events\/ev-gbm\/opengraph-image/);
  await page.goto("/calendar");
  expect((await head(page)).ogImage).toMatch(/\/opengraph-image(\?|$)/);
});

test("calendar views and event occurrences canonicalize to the bare URL", async ({ page, baseURL }) => {
  for (const q of ["?view=day", "?view=year", "?view=month&date=2026-11-03", "?view=day&date=2026-10-23"]) {
    await page.goto(`/calendar${q}`);
    expect(same((await head(page)).canonical, `${baseURL}/calendar`), q).toBe(true);
  }
  await page.goto("/calendar/events/ev-jummah?occurrence=2026-10-30T20:15:00.000Z");
  expect(same((await head(page)).canonical, `${baseURL}/calendar/events/ev-jummah`)).toBe(true);
});

test("landing JSON-LD: Organization and WebSite", async ({ page, baseURL }) => {
  await page.goto("/");
  const ld = await jsonLd(page);
  const org = ld.find((x) => x["@type"] === "Organization");
  const site = ld.find((x) => x["@type"] === "WebSite");
  expect(org).toMatchObject({ name: "MSA at UCSC", url: new URL(baseURL!).origin });
  expect(org!.alternateName).toContain("UCSC MSA");
  const logo = await page.request.get(org!.logo as string);
  expect(logo.status()).toBe(200);
  expect(site).toMatchObject({ name: "MSA at UCSC" });
  expect(site!.alternateName).toContain("UCSC MSA");
});

test("event JSON-LD has the fields Google's event results need", async ({ page }) => {
  for (const id of ["ev-gbm", "ev-jummah"]) {
    await page.goto(`/calendar/events/${id}`);
    const ld = await jsonLd(page);
    const ev = ld.find((x) => x["@type"] === "Event") as unknown as EventLd;
    expect(ev, id).toBeTruthy();
    expect(ev.name, id).toBeTruthy();
    // Local time with the Pacific offset, never UTC "Z".
    expect(ev.startDate, id).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-0[78]:00$/);
    expect(ev.endDate, id).toMatch(/-0[78]:00$/);
    expect(ev.eventStatus, id).toBe("https://schema.org/EventScheduled");
    expect(ev.eventAttendanceMode, id).toBe("https://schema.org/OfflineEventAttendanceMode");
    expect(ev.location["@type"], id).toBe("Place");
    expect(ev.location.name, id).toBeTruthy();
    expect(ev.location.address.addressLocality, id).toBe("Santa Cruz");
    expect(ev.organizer, id).toMatchObject({ "@type": "Organization", name: "MSA at UCSC" });
    expect(ld.find((x) => x["@type"] === "BreadcrumbList"), id).toBeTruthy();
  }
  // The weekly series is marked up as its next occurrence.
  await page.goto("/calendar/events/ev-jummah");
  const ev = (await jsonLd(page)).find((x) => x["@type"] === "Event") as unknown as EventLd;
  expect(new Date(ev.startDate).getTime()).toBeGreaterThan(Date.now() - 2 * 60 * 60 * 1000);
});

test("robots.txt keeps crawlers out of admin and the API and names the sitemap", async ({ request, baseURL }) => {
  const res = await request.get("/robots.txt");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toMatch(/^text\/plain/);
  const body = await res.text();
  expect(body).toContain("Disallow: /admin");
  expect(body).toContain("Disallow: /api");
  expect(body).toContain(`Sitemap: ${new URL(baseURL!).origin}/sitemap.xml`);
});

test("sitemap.xml lists the pages and events, not cancelled ones", async ({ request, baseURL }) => {
  const res = await request.get("/sitemap.xml");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toMatch(/xml/);
  const xml = await res.text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  expect(locs).toEqual(expect.arrayContaining(["/", "/calendar", ...INDEXABLE.slice(2)]));
  expect(locs).not.toContain("/calendar/events/ev-cleanup");
  expect(xml).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}T/);
  for (const l of [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]) {
    expect(new URL(l[1]).origin).toBe(new URL(baseURL!).origin);
  }
});

test("login and admin stay out of search", async ({ page, context, baseURL }) => {
  await page.goto("/login");
  expect((await head(page)).robots).toBe("noindex, nofollow");
  test.skip(!seed(), "needs the seeded session tokens (E2E_SEED_FILE)");
  await signIn(context, baseURL!, "admin");
  await page.goto("/admin");
  expect((await head(page)).robots).toMatch(/^noindex, nofollow/);
});
