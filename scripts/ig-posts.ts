// Reads image posts from a public Instagram profile (@ucsc.msa) through a
// SEPARATE headless Helium launched on a throwaway COPY of the signed-in
// profile. Read-only: GET requests from the page context only, slowly, with a
// hard stop on any challenge/login wall/"try again later". The copy holds the
// user's session cookies and is deleted on every exit. The real browser is
// never touched. Reels and videos are skipped; carousels keep their images.
//
// midna's rules: never touch the real browser session, never Safari, stop on
// any keychain/password prompt. Images and captions are public, so they go to
// the big T7 disk; the profile copy stays on the (encrypted) internal disk.

import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export const HELIUM_BIN = "/Applications/Helium.app/Contents/MacOS/Helium";
export const HELIUM_SUPPORT = "net.imput.helium";
// Only these are copied from the profile; caches and Singleton* locks are left.
export const PROFILE_ALLOWLIST = ["Cookies", "Cookies-journal", "Preferences", "Secure Preferences", "Network Persistent State", "TransportSecurity"];
const APP_ID = "936619743392459";
const STOP_RE = /checkpoint_required|challenge_required|login_required|feedback_required|please wait a few minutes|try again later|rate.?limit/i;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";

/** Instagram gave a challenge, login wall or rate limit. Scraping must stop. */
export class IgStop extends Error {}

// Instagram's private web API JSON, loosely typed to only what we read.
type ImgVersions = { candidates?: { url: string; width: number; height: number }[] };
export type IgMedia = { media_type?: number; image_versions2?: ImgVersions };
export type IgFeedItem = IgMedia & {
  code?: string;
  caption?: { text?: string } | null;
  taken_at?: number;
  timeline_pinned_user_ids?: unknown[];
  carousel_media?: IgMedia[];
};

export type IgPost = {
  shortcode: string;
  url: string;
  takenAt: number;
  date: string;
  caption: string;
  mediaType: "image" | "carousel";
  images: string[];
  pinned: boolean;
};

const fmtDate = (unixSeconds: number) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Los_Angeles", dateStyle: "short", timeStyle: "short" }).format(new Date(unixSeconds * 1000));

/** The largest image candidate URL from a media node. */
export function bestImage(iv: ImgVersions | undefined): string | undefined {
  const c = [...(iv?.candidates ?? [])].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  return c?.url;
}

/** Shape one Instagram feed item into an IgPost, or null if it's a reel/video. */
export function shapeItem(it: IgFeedItem, cutoff: number): { post: IgPost; mediaNodes: IgMedia[] } | null {
  const takenAt = it.taken_at ?? 0;
  if (takenAt < cutoff) return null;
  const isCarousel = it.media_type === 8;
  const nodes: IgMedia[] = isCarousel ? it.carousel_media ?? [] : [it];
  // image = 1, video = 2. Skip pure videos/reels; keep image frames of a carousel.
  const imageNodes = nodes.filter((n) => n.media_type !== 2);
  if (imageNodes.length === 0 || !it.code) return null;
  const pinned = (it.timeline_pinned_user_ids ?? []).length > 0;
  return {
    post: {
      shortcode: it.code,
      url: `https://www.instagram.com/p/${it.code}/`,
      takenAt,
      date: fmtDate(takenAt),
      caption: it.caption?.text ?? "",
      mediaType: isCarousel ? "carousel" : "image",
      images: [],
      pinned,
    },
    mediaNodes: imageNodes,
  };
}

// ---- Local "Download your information" export (no scraping) ----

type ExportMedia = { uri?: string; creation_timestamp?: number; title?: string };
type ExportPost = { media?: ExportMedia[]; creation_timestamp?: number; title?: string };

/** Find the posts JSON files in a DYI export (posts_1.json, etc.), to depth 6. */
function findPostsJson(dir: string, depth = 6): string[] {
  const found: string[] = [];
  const walk = (d: string, left: number) => {
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const name of entries) {
      const p = join(d, name);
      let isDir = false;
      try {
        isDir = statSync(p).isDirectory();
      } catch {
        continue;
      }
      if (isDir) {
        if (left > 0) walk(p, left - 1);
      } else if (/^posts(_\d+)?\.json$/i.test(name)) {
        found.push(p);
      }
    }
  };
  walk(dir, depth);
  return found.sort();
}

/**
 * Read image posts from a local Instagram "Download your information" export
 * folder. No network, no browser: the media files are already on disk. Posts
 * with only video are skipped. The id is derived from the post's timestamp
 * (the export carries no shortcode), so re-reading the same export is stable.
 */
export function readInstagramExport(dir: string, since: Date): IgPost[] {
  const cutoff = Math.floor(since.getTime() / 1000);
  const posts: IgPost[] = [];
  const seen = new Set<string>();
  for (const file of findPostsJson(dir)) {
    let data: unknown;
    try {
      data = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    const arr: ExportPost[] = Array.isArray(data) ? data : ((data as Record<string, unknown>).ig_posts as ExportPost[]) ?? ((data as Record<string, unknown>).posts as ExportPost[]) ?? [];
    for (const post of arr) {
      const media = post.media ?? [];
      const images = media.filter((m) => m.uri && /\.(jpe?g|png|webp)$/i.test(m.uri)).map((m) => resolve(dir, m.uri!));
      if (images.length === 0) continue; // video-only
      const takenAt = post.creation_timestamp ?? media[0]?.creation_timestamp ?? 0;
      if (takenAt < cutoff) continue;
      const code = `ts${takenAt}`;
      if (seen.has(code)) continue;
      seen.add(code);
      posts.push({
        shortcode: code,
        url: `instagram-export:${code}`,
        takenAt,
        date: fmtDate(takenAt),
        caption: post.title ?? media[0]?.title ?? "",
        mediaType: images.length > 1 ? "carousel" : "image",
        images,
        pinned: false,
      });
    }
  }
  return posts.sort((a, b) => a.takenAt - b.takenAt);
}

type CdpMessage = { id?: number; error?: { message: string }; result?: unknown };
type EvalResult = { result?: { value?: unknown }; exceptionDetails?: { exception?: { description?: string }; text?: string } };
type Cdp = { send: (method: string, params?: object) => Promise<unknown>; evaluate: (fn: string, arg?: unknown) => Promise<unknown>; close: () => void };

async function connectCdp(port: number): Promise<Cdp> {
  const list = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
  const page = list.find((t) => t.type === "page");
  if (!page) throw new Error("no CDP page target");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise<void>((res, rej) => {
    ws.onopen = () => res();
    ws.onerror = () => rej(new Error("CDP websocket error"));
  });
  let nextId = 1;
  const pending = new Map<number, (m: CdpMessage) => void>();
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data)) as CdpMessage;
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)!(m);
      pending.delete(m.id);
    }
  };
  const send = (method: string, params: object = {}) =>
    new Promise<unknown>((res, rej) => {
      const id = nextId++;
      pending.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (fn: string, arg?: unknown) => {
    const r = (await send("Runtime.evaluate", { expression: `(${fn})(${JSON.stringify(arg ?? null)})`, awaitPromise: true, returnByValue: true })) as EvalResult;
    if (r.exceptionDetails) throw new Error(`page: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result?.value;
  };
  return { send, evaluate, close: () => ws.close() };
}

export type FetchOptions = {
  username: string;
  /** Oldest post to keep (inclusive), as a Date. */
  since: Date;
  /** Where images and manifest.json are written (the T7 folder). */
  outDir: string;
  maxPages?: number;
  log?: (s: string) => void;
  /** For tests: skip launching Helium and use this CDP instead. */
  cdpFactory?: () => Promise<Cdp>;
  /** The between-request pause. Real delay by default; tests pass a no-op. */
  sleep?: (ms: number) => Promise<void>;
};

/**
 * Copy the allowlisted profile files to a private temp dir on the internal
 * disk, after a free-space check. Returns the temp dir; caller must delete it.
 */
export function copyProfile(): string {
  const src = join(process.env.HOME!, "Library", "Application Support", HELIUM_SUPPORT);
  const free = spawnSync("df", ["-m", tmpdir()], { encoding: "utf8" }).stdout.trim().split("\n")[1]?.split(/\s+/)[3];
  if (Number(free) < 60) throw new Error(`only ${free} MB free on the internal disk; refusing to copy the profile`);
  const dir = mkdtempSync(join(tmpdir(), "ig-profile-"));
  spawnSync("chmod", ["700", dir]);
  mkdirSync(join(dir, "Default"), { mode: 0o700 });
  if (existsSync(join(src, "Local State"))) cpSync(join(src, "Local State"), join(dir, "Local State"));
  for (const f of PROFILE_ALLOWLIST) {
    const p = join(src, "Default", f);
    if (existsSync(p)) cpSync(p, join(dir, "Default", f));
  }
  return dir;
}

/** A free localhost port. */
function freePort(): number {
  const r = spawnSync("python3", ["-I", "-c", "import socket;s=socket.socket();s.bind(('127.0.0.1',0));print(s.getsockname()[1]);s.close()"], { encoding: "utf8" });
  return Number(r.stdout.trim());
}

/**
 * Read image posts since `since`. Launches (and always tears down) a headless
 * Helium on a throwaway profile copy, unless a cdpFactory is supplied (tests).
 * Saves images + manifest.json to outDir. Returns the posts read this run.
 * Throws IgStop on any challenge; the caller should report and not retry.
 */
export async function fetchInstagramPosts(opts: FetchOptions): Promise<IgPost[]> {
  const log = opts.log ?? (() => {});
  const sleep = opts.sleep ?? delay;
  const cutoff = Math.floor(opts.since.getTime() / 1000);
  mkdirSync(opts.outDir, { recursive: true });
  const manifestFile = join(opts.outDir, "manifest.json");
  const manifest: IgPost[] = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, "utf8")) : [];
  const save = () => {
    writeFileSync(`${manifestFile}.tmp`, JSON.stringify(manifest, null, 2), { mode: 0o600 });
    renameSync(`${manifestFile}.tmp`, manifestFile);
  };

  let profileDir: string | null = null;
  let helium: ReturnType<typeof spawn> | null = null;
  let cdp: Cdp | null = null;
  const read: IgPost[] = [];
  try {
    if (opts.cdpFactory) {
      cdp = await opts.cdpFactory();
    } else {
      profileDir = copyProfile();
      const port = freePort();
      helium = spawn(
        HELIUM_BIN,
        [`--headless=new`, `--user-data-dir=${profileDir}`, `--remote-debugging-port=${port}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-sync", `--disk-cache-dir=${join(profileDir, "cache")}`, "--disk-cache-size=1048576", `--user-agent=${UA}`, "about:blank"],
        { stdio: "ignore", detached: false },
      );
      log(`headless Helium pid ${helium.pid} on 127.0.0.1:${port}`);
      for (let i = 0; i < 60; i++) {
        try {
          await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
          break;
        } catch {
          await sleep(500);
        }
      }
      cdp = await connectCdp(port);
    }

    const api = async (path: string) => {
      const r = (await cdp!.evaluate(
        `async (p) => { const r = await fetch(p, { headers: { "X-IG-App-ID": "${APP_ID}", "X-Requested-With": "XMLHttpRequest" }, credentials: "include" }); return { status: r.status, url: r.url, text: await r.text() }; }`,
        path,
      )) as { status: number; url: string; text: string };
      if (r.status !== 200 || STOP_RE.test(String(r.text).slice(0, 2000)) || /\/accounts\/login|\/challenge/.test(r.url)) {
        throw new IgStop(`GET ${path.split("?")[0]} -> ${r.status}: ${String(r.text).slice(0, 160).replace(/\s+/g, " ")}`);
      }
      return JSON.parse(r.text);
    };
    const downloadImage = async (url: string, file: string) => {
      const r = (await cdp!.evaluate(
        `async (u) => { const r = await fetch(u, { credentials: "omit" }); if (!r.ok) return { status: r.status }; const b = new Uint8Array(await r.arrayBuffer()); let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return { status: 200, b64: btoa(s) }; }`,
        url,
      )) as { status: number; b64?: string };
      if (r.status !== 200 || !r.b64) throw new IgStop(`image download -> ${r.status}`);
      writeFileSync(file, Buffer.from(r.b64, "base64"), { mode: 0o600 });
    };

    await cdp!.send("Page.enable").catch(() => {});
    await cdp!.send("Page.navigate", { url: `https://www.instagram.com/${opts.username}/` });
    await sleep(5000);
    const info = await api(`/api/v1/users/web_profile_info/?username=${opts.username}`);
    const user = info.data.user;
    log(`@${user.username}: ${user.edge_owner_to_timeline_media?.count} posts`);
    let maxId: string | undefined;
    const maxPages = opts.maxPages ?? 1000;
    for (let p = 1; p <= maxPages; p++) {
      await sleep(7000 + Math.random() * 4000);
      const feed = await api(`/api/v1/feed/user/${user.id}/?count=12${maxId ? `&max_id=${encodeURIComponent(maxId)}` : ""}`);
      let older = false;
      for (const it of feed.items ?? []) {
        const shaped = shapeItem(it, cutoff);
        if (!shaped) {
          if (it.taken_at < cutoff && !(it.timeline_pinned_user_ids ?? []).length) older = true;
          continue;
        }
        const { post, mediaNodes } = shaped;
        for (let i = 0; i < mediaNodes.length; i++) {
          const file = `${post.shortcode}-${i + 1}.jpg`;
          const url = bestImage(mediaNodes[i].image_versions2);
          if (!url) continue;
          if (!existsSync(join(opts.outDir, file))) {
            await sleep(2500 + Math.random() * 2000);
            await downloadImage(url, join(opts.outDir, file));
          }
          post.images.push(file);
        }
        const prev = manifest.findIndex((m) => m.shortcode === post.shortcode);
        if (prev >= 0) manifest[prev] = post;
        else manifest.push(post);
        read.push(post);
        save();
        log(`${post.date} ${post.shortcode} ${post.mediaType} ${post.images.length} img${post.pinned ? " (pinned)" : ""}`);
      }
      log(`page ${p}: ${feed.items?.length ?? 0} items; more=${feed.more_available}`);
      if (older || !feed.more_available || !feed.next_max_id) break;
      maxId = feed.next_max_id;
    }
  } finally {
    cdp?.close();
    if (helium?.pid) {
      try {
        process.kill(helium.pid);
      } catch {
        /* already gone */
      }
      for (let i = 0; i < 20 && isAlive(helium.pid); i++) spawnSync("sleep", ["0.5"]);
      if (isAlive(helium.pid)) {
        try {
          process.kill(helium.pid, "SIGKILL");
        } catch {
          /* gone */
        }
      }
    }
    if (profileDir) rmSync(profileDir, { recursive: true, force: true });
    log(`cleanup: headless Helium stopped; profile copy deleted: ${profileDir ? !existsSync(profileDir) : "n/a"}`);
  }
  return read;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// CLI: bun scripts/ig-posts.ts --since <ISO> [--max-pages N] [--out <dir>] [--username <name>]
async function main(argv: string[]): Promise<number> {
  const val = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const since = val("--since");
  if (!since) {
    process.stderr.write("usage: bun scripts/ig-posts.ts --since <ISO date> [--max-pages N] [--out <dir>] [--username <name>]\n");
    return 2;
  }
  const out = val("--out") ?? join(process.env.HOME!, ".config", "midna", "ucscmsa-ig");
  try {
    const posts = await fetchInstagramPosts({
      username: val("--username") ?? "ucsc.msa",
      since: new Date(since),
      outDir: out,
      maxPages: val("--max-pages") ? Number(val("--max-pages")) : undefined,
      log: (s) => process.stderr.write(`${new Date().toISOString().slice(11, 19)} ${s}\n`),
    });
    process.stdout.write(`${JSON.stringify(posts, null, 2)}\n`);
    return 0;
  } catch (e) {
    if (e instanceof IgStop) {
      process.stderr.write(`STOPPED (Instagram): ${e.message}\n`);
      return 3;
    }
    process.stderr.write(`ERROR: ${e instanceof Error ? e.message : String(e)}\n`);
    return 1;
  }
}

if ((import.meta as { main?: boolean }).main) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
