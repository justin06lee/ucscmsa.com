// Records the home page's paper jungle, phone and laptop, from the browser's own
// frames (sharper than Playwright's video on paper grain), plus stills.
//   node scripts/jungle-demo.mjs <base-url> <out-dir>
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const [base, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function glide(page, to, ms) {
  await page.evaluate(
    ([target, dur]) =>
      new Promise((done) => {
        const from = window.scrollY;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const end = Math.min(max, target);
        const t0 = performance.now();
        const step = (now) => {
          const p = Math.min(1, (now - t0) / dur);
          const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
          window.scrollTo(0, from + (end - from) * e);
          if (p < 1) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      }),
    [to, ms],
  );
}

async function record(browser, name, options, walk) {
  const ctx = await browser.newContext(options);
  const page = await ctx.newPage();
  const dir = mkdtempSync(path.join(os.tmpdir(), "jungle-"));
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
    const file = path.join(dir, `${String(frames.length).padStart(5, "0")}.jpg`);
    writeFileSync(file, Buffer.from(data, "base64"));
    frames.push({ file, t: metadata.timestamp });
    await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await page.addInitScript(() => {
    const css = "nextjs-portal{display:none!important}";
    addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = css;
      document.head.appendChild(s);
    });
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, everyNthFrame: 1 });
  await page.goto(base, { waitUntil: "load" });
  await walk(page);
  await cdp.send("Page.stopScreencast");
  await sleep(200);
  const lines = frames.flatMap((f, i) => [`file '${f.file}'`, `duration ${Math.max(0.001, (frames[i + 1]?.t ?? f.t + 0.05) - f.t).toFixed(4)}`]);
  writeFileSync(path.join(dir, "list.txt"), `${lines.join("\n")}\nfile '${frames.at(-1).file}'\n`);
  const mp4 = path.join(out, `${name}.mp4`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(dir, "list.txt"), "-vf", "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-crf", "21", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
  const span = frames.at(-1).t - frames[0].t;
  console.log(`${name}: ${span.toFixed(1)}s, ${frames.length} frames, ${(frames.length / span).toFixed(1)} fps`);
  rmSync(dir, { recursive: true, force: true });
  await ctx.close();
}

const browser = await chromium.launch({ args: ["--use-mock-keychain", "--password-store=basic"] });

await record(browser, "paper-jungle-laptop", { viewport: { width: 1440, height: 900 }, timezoneId: "America/Los_Angeles" }, async (page) => {
  await page.evaluate(() => {
    const dot = document.createElement("div");
    dot.style.cssText = "position:fixed;z-index:99;width:16px;height:16px;margin:-8px;border-radius:50%;background:rgb(21 19 18 / .55);box-shadow:0 0 0 2px rgb(255 255 255 / .8);pointer-events:none;left:-40px;top:-40px";
    document.body.appendChild(dot);
    addEventListener("pointermove", (e) => { dot.style.left = `${e.clientX}px`; dot.style.top = `${e.clientY}px`; });
  });
  await sleep(3200); // the logo falls in
  for (const [x, y] of [[1240, 420], [200, 380], [720, 500]]) {
    await page.mouse.move(x, y, { steps: 70 });
    await sleep(300);
  }
  await page.screenshot({ path: path.join(out, "still-laptop-top.png") });
  await glide(page, 360, 3000);
  await page.screenshot({ path: path.join(out, "still-laptop-slide.png") });
  await glide(page, 1000, 3400);
  await sleep(600);
  await glide(page, 99999, 3200);
  await sleep(900);
  await page.screenshot({ path: path.join(out, "still-laptop-end.png") });
  await glide(page, 0, 3400);
  await sleep(800);
});

await record(browser, "paper-jungle-phone", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: "America/Los_Angeles" }, async (page) => {
  await sleep(3200);
  await page.screenshot({ path: path.join(out, "still-phone-top.png") });
  await glide(page, 330, 2800);
  await page.screenshot({ path: path.join(out, "still-phone-slide.png") });
  await sleep(300);
  await glide(page, 1500, 4000);
  await sleep(300);
  await glide(page, 99999, 3600);
  await sleep(900);
  await page.screenshot({ path: path.join(out, "still-phone-end.png") });
  await glide(page, 0, 3400);
  await sleep(700);
});

await browser.close();
