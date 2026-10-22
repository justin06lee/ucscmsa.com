/**
 * Shared by the phone demo recordings (scripts/demo-video.ts,
 * scripts/events-demo.ts): a 390x844 touch phone that records itself, eased
 * scrolls, taps with a visible touch dot, and the webm → H.264 MP4 step.
 * Read-only by design: the demos only load pages and tap links.
 */
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const W = 390;
export const H = 844;

export function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A day cell in the month or year grid, e.g. "Friday, October 23, 3 events".
export function dayCell(page: Page, ymd: string): Locator {
  const day = new Date(`${ymd}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  return page.getByRole("link", { name: new RegExp(`^${day}, (\\d+ events?|no events)$`) });
}

// Eased scroll so the video moves smoothly rather than jumping.
export async function scrollTo(page: Page, y: number, ms = 1200) {
  await page.evaluate(
    ([to, dur]) =>
      new Promise<void>((done) => {
        const from = window.scrollY;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const target = Math.max(0, Math.min(to, max));
        const t0 = performance.now();
        const step = (now: number) => {
          const p = Math.min(1, (now - t0) / dur);
          const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
          window.scrollTo(0, from + (target - from) * e);
          if (p < 1) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      }),
    [y, ms] as const,
  );
}

export async function scrollToShow(page: Page, el: Locator, offset = 120, ms = 1200) {
  const top = await el.evaluate((n) => n.getBoundingClientRect().top + window.scrollY);
  await scrollTo(page, top - offset, ms);
}

// A brief touch dot where the finger lands, so viewers can follow the taps.
export async function tap(page: Page, el: Locator) {
  await el.scrollIntoViewIfNeeded();
  const b = (await el.boundingBox())!;
  await page.evaluate(
    ([x, y]) => {
      const d = document.createElement("div");
      d.style.cssText = `position:fixed;left:${x - 18}px;top:${y - 18}px;width:36px;height:36px;border-radius:50%;background:rgba(107,31,42,.28);pointer-events:none;z-index:2147483647;transition:opacity .45s ease,transform .45s ease`;
      document.body.appendChild(d);
      requestAnimationFrame(() => {
        d.style.opacity = "0";
        d.style.transform = "scale(1.6)";
      });
      setTimeout(() => d.remove(), 600);
    },
    [b.x + b.width / 2, b.y + b.height / 2] as const,
  );
  await sleep(250);
  try {
    await el.tap({ timeout: 3000 });
  } catch {
    // A page wider than the screen (it happened with the old landing
    // wordmark) shifts touch coordinates; say so rather than hide it.
    console.warn(`warning: tap missed, clicking instead: ${await el.textContent()}`);
    await el.evaluate((n) => (n as HTMLElement).click());
  }
}

export async function settle(page: Page) {
  await page.waitForLoadState("load");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  // The calendar streams its view in; hold on the real thing, not the skeleton.
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
}

export type Recording = {
  page: Page;
  /** Note what starts now, as a time in the finished video. */
  mark: (label: string) => void;
  /** Call once the first page has settled: the video starts here. */
  startHere: () => void;
  /** Stop, convert to H.264 MP4 at 780x1688, print the marks. */
  finish: () => Promise<void>;
};

export async function record(out: string): Promise<Recording> {
  mkdirSync(path.dirname(out), { recursive: true });
  const tmp = mkdtempSync(path.join(os.tmpdir(), "ucscmsa-demo-"));
  const browser: Browser = await chromium.launch();
  const context: BrowserContext = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    timezoneId: "America/Los_Angeles",
    // Playwright's recorder captures CSS pixels whatever the scale factor, so
    // record at 390x844 and upscale in ffmpeg below.
    recordVideo: { dir: tmp, size: { width: W, height: H } },
  });
  const page = await context.newPage();
  const t0 = Date.now();
  const marks: [number, string][] = [];
  let lead = 0;
  return {
    page,
    mark: (label) => marks.push([(Date.now() - t0) / 1000 - lead, label]),
    startHere: () => {
      lead = (Date.now() - t0) / 1000;
    },
    finish: async () => {
      marks.push([(Date.now() - t0) / 1000 - lead, "end"]);
      await context.close();
      await browser.close();
      const webm = path.join(tmp, readdirSync(tmp).find((f) => f.endsWith(".webm"))!);
      execFileSync("ffmpeg", [
        "-y", "-loglevel", "error", "-ss", lead.toFixed(2), "-i", webm,
        "-vf", `scale=${W * 2}:${H * 2}:flags=lanczos`,
        "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
        "-r", "30", "-movflags", "+faststart", "-an", out,
      ]);
      rmSync(tmp, { recursive: true, force: true });
      console.log(`wrote ${out}`);
      for (const [t, label] of marks) console.log(`${t.toFixed(1).padStart(5)}s  ${label}`);
    },
  };
}
