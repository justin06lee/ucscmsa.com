import { test, expect, type Page } from "@playwright/test";
import { seed, signIn } from "./fixtures";

// Site-wide rules, page by page (fixtures from scripts/seed-local.ts):
// - every off-site link opens in a new tab with rel="noopener noreferrer"
//   (event links may add more, e.g. "nofollow ugc"), and links within the
//   site stay in the same tab;
// - no arrows in the text, labels or metadata: plain words say where a link
//   goes, and the few icons left (the calendar's previous and next) are named.

const PUBLIC = [
  "/",
  "/calendar?view=month&date=2026-10-20",
  "/calendar?view=month",
  "/calendar?view=day&date=2026-10-23",
  "/calendar?view=day",
  "/calendar?view=year&date=2026-10-20",
  "/calendar/events/ev-gbm",
  "/calendar/events/ev-halaqa",
  "/calendar/events/ev-sisters",
  "/calendar/events/ev-panel",
  "/calendar/events/ev-date-only",
  "/calendar/events/ev-start-only",
  "/calendar/events/ev-potluck",
  "/calendar/events/ev-past-01",
  "/login",
  "/this-page-does-not-exist",
];

const ADMIN = [
  "/admin",
  "/admin/events/new",
  "/admin/events/ev-panel/edit",
  // Imported, with a WhatsApp link as its source.
  "/admin/events/ev-cleanup/edit",
  "/admin/admins",
  "/admin/nominations",
  "/admin/plan",
  "/admin/plan/ev-bonfire",
  "/admin/plan/settings",
  "/admin/playbook",
  "/admin/playbook/promotion",
  "/admin/playbook/promotion/edit",
];

type Check = { offSite: number; problems: string[] };

/** Every http(s) link on the page, checked against the new-tab rule. */
function checkLinks(page: Page): Promise<Check> {
  return page.evaluate(() => {
    const problems: string[] = [];
    let offSite = 0;
    for (const a of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
      const url = new URL(a.getAttribute("href")!, location.href);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      const name = `"${(a.textContent ?? "").trim().slice(0, 40)}" ${url.href.slice(0, 60)}`;
      if (url.origin === location.origin) {
        if (a.target === "_blank") problems.push(`site link in a new tab: ${name}`);
        continue;
      }
      offSite++;
      const rel = a.rel.split(/\s+/);
      if (a.target !== "_blank") problems.push(`no target=_blank: ${name}`);
      if (!rel.includes("noopener") || !rel.includes("noreferrer")) problems.push(`rel "${a.rel}": ${name}`);
    }
    return { offSite, problems };
  });
}

const ARROWS = /[←→↑↓↔↕↖↗↘↙⇐⇒⇦⇨⇽⇾⟵⟶⟷➔➜➝➞➟➠➡⬅⬆⬇«»‹›]|->|<-/;

/** Arrows anywhere a visitor or a screen reader would meet them. */
function findArrows(page: Page): Promise<string[]> {
  return page.evaluate((source) => {
    const re = new RegExp(source);
    const found: string[] = [];
    const look = (where: string, text: string | null | undefined) => {
      if (text && re.test(text)) found.push(`${where}: ${text.trim().slice(0, 60)}`);
    };
    look("title", document.title);
    for (const m of document.querySelectorAll("meta[content]")) look(`meta ${m.getAttribute("name") ?? m.getAttribute("property")}`, m.getAttribute("content"));
    // All text, screen-reader-only and folded text included; scripts aren't text.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.parentElement?.closest("script, style, noscript, template")) look("text", n.textContent);
    }
    for (const el of document.querySelectorAll("[aria-label], [title], [alt], [placeholder]")) {
      for (const attr of ["aria-label", "title", "alt", "placeholder"]) look(attr, el.getAttribute(attr));
    }
    return found;
  }, ARROWS.source);
}

test("off-site links open in a new tab, site links don't, and nothing shows an arrow", async ({ page, context, baseURL }) => {
  test.setTimeout(120_000);
  const pages = [...PUBLIC];
  if (seed()) {
    await signIn(context, baseURL!, "admin");
    pages.push(...ADMIN);
  }
  let offSite = 0;
  const problems: string[] = [];
  for (const path of pages) {
    await page.goto(path);
    const check = await checkLinks(page);
    offSite += check.offSite;
    problems.push(...check.problems.map((p) => `${path}: ${p}`));
    problems.push(...(await findArrows(page)).map((p) => `${path}: arrow in ${p}`));
  }
  expect(problems).toEqual([]);
  // The pages above carry RSVP and form buttons, description URLs, maps,
  // Google Calendar, donate links and the 404 credit: a run that saw none
  // checked nothing.
  expect(offSite).toBeGreaterThanOrEqual(10);
});

test("the checks catch a bad link and an arrow", async ({ page }) => {
  await page.setContent(`
    <a href="https://example.com/a">same tab</a>
    <a href="https://example.com/b" target="_blank" rel="noopener">no noreferrer</a>
    <a href="https://example.com/c" target="_blank" rel="noopener noreferrer nofollow ugc">fine</a>
    <p>See all →</p>`);
  const { offSite, problems } = await checkLinks(page);
  expect(offSite).toBe(3);
  // The first lacks the target and both rel words; the second lacks noreferrer.
  expect(problems).toHaveLength(3);
  expect(await findArrows(page)).toHaveLength(1);
});
