// The daily MSA sync pipeline. One command:
//   1. SCRAPE (plain code): new WhatsApp announcements since the last run, each
//      with the flyer(s) Justin saved, matched from a folder by timestamp.
//   2. EVENTIFY (an LLM through yagami): turn each new message + its flyer into
//      an event JSON. Never invents a time; low-confidence items go to review.
//   3. POST: the import API, idempotent on stable wa: ids.
// State, summary and the review file live in ~/.local/share/midna-ucscmsa. A
// normal run posts; --dry-run previews. Non-zero exit on any error.
//
// Usage:
//   bun scripts/msa-sync.ts [--dry-run] [--since <ISO>] [--images <folder>]
//                           [--config <wa.json>] [--sync-config <sync.json>]

import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { draftToOperation, eventify, type CallModel, type LinkEntry, type SourceItem } from "./eventify";
import { assignFlyers, indexFlyers } from "./flyers";
import { imagesClient, lazyBlobUpload, runImageSync, summarize } from "./flyer-upload";
import { indexImageFolder, matchImages, type Candidate, type DatedImage } from "./image-folder";
import {
  expandHome,
  loadConfig,
  openWithBunSqlite,
  readMessages,
  runImport,
  UsageError,
  withDbCopy,
  readToken,
  type Config,
  type WaMessage,
} from "./wa-announcements";

const DEFAULT_SYNC_CONFIG = "~/.local/share/midna-ucscmsa/ucscmsa-sync.json";
const DEFAULT_SYNC_STATE = "~/.local/share/midna-ucscmsa/ucscmsa-sync-state.json";
const DEFAULT_REVIEW_FILE = "~/.local/share/midna-ucscmsa/ucscmsa-sync-review.json";
const DEFAULT_FLYER_DIR = "~/.local/share/midna-ucscmsa/flyers/Msa events";

const DEFAULT_ENV_FILE = "~/.local/share/midna-ucscmsa/msa-sync.env";
const DEFAULT_BASE_URL = "http://127.0.0.1:8787"; // yagami on this Mac

const syncConfigSchema = z.object({
  aiBaseUrl: z.string().url().optional(),
  envFile: z.string().optional(),
  aiModel: z.string().default("claude-haiku-5-5"),
  aiVerifierModel: z.string().default("claude-sonnet-5-5"),
  aiEffort: z.string().default("medium"),
  confidenceFloor: z.number().min(0).max(1).optional(),
  flyerDir: z.string().optional(),
  stateFile: z.string().optional(),
  reviewFile: z.string().optional(),
});
export type SyncConfig = z.infer<typeof syncConfigSchema>;

export type SyncState = {
  version: 1;
  lastWaUnix: number | null;
  /** sourceId -> last content hash we eventified, and what became of it. */
  processed: Record<string, { hash: string; status: string }>;
  /** --images: file path -> its size:mtime when last matched, and the event it went to (null: review). */
  images?: Record<string, { key: string; sourceId: string | null }>;
  /** Jummah one-offs posted, by Friday (YYYY-MM-DD) -> sourceId, so a later "no Jummah" can cancel it. */
  jummah?: Record<string, string>;
};

export function loadSyncConfig(path: string): SyncConfig {
  const p = expandHome(path);
  const raw = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : {};
  const parsed = syncConfigSchema.safeParse(raw);
  if (!parsed.success) throw new UsageError(`Bad sync config ${p}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return parsed.data;
}

export function loadSyncState(path: string): SyncState {
  const p = expandHome(path);
  if (!existsSync(p)) return { version: 1, lastWaUnix: null, processed: {} };
  return JSON.parse(readFileSync(p, "utf8")) as SyncState;
}

export function saveSyncState(path: string, state: SyncState): void {
  const p = expandHome(path);
  writeFileSync(`${p}.tmp`, JSON.stringify(state, null, 2), { mode: 0o600 });
  renameSync(`${p}.tmp`, p); // atomic replace
}

const contentHash = (text: string, imageKey: string) =>
  createHash("sha256").update(JSON.stringify([text, imageKey])).digest("hex").slice(0, 16);

const IMG_TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

function imageForPath(path: string | null | undefined): { imageBase64: string; imageMediaType: string } | null {
  if (!path || !existsSync(path)) return null;
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  const media = IMG_TYPES[ext];
  if (!media) return null;
  // Anthropic/yagami cap image input ~5 MB; flyers are well under, but guard.
  if (statSync(path).size > 5_000_000) return null;
  return { imageBase64: readFileSync(path).toString("base64"), imageMediaType: media };
}

// yagami returns overloads/limits as HTTP 200 with the CLI's error as the text.
const OVERLOAD_RE = /API Error:\s*(408|409|429|5\d\d)|overloaded|rate.?limit|usage limit|please try again|service unavailable/i;
const CONN_REFUSED_RE = /ECONNREFUSED|connection refused|failed to fetch|unable to connect/i;
const MAX_AI_RETRIES = 6;

const nap = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * A real yagami/Anthropic call: raw POST to <base>/v1/messages, with
 * mira's retry policy — up to 6 tries honouring Retry-After then 1s..60s
 * backoff, treating 5xx/429 and HTTP-200 overload replies as retryable, but
 * never retrying a refused connection or an auth error. A request with no
 * answer in `timeoutMs` (default 5 min) fails without a retry: yagami's turn is
 * stalled upstream, and another request would only queue behind it.
 */
export function yagamiCall(cfg: { baseUrl: string; apiKey: string; effort?: string; sleep?: (ms: number) => Promise<void>; timeoutMs?: number }): CallModel {
  const sleep = cfg.sleep ?? nap;
  const timeoutMs = cfg.timeoutMs ?? 300_000;
  const stalled = (e: unknown, model: string) =>
    e instanceof Error && e.name === "TimeoutError" ? new Error(`model ${model}: no answer from yagami in ${timeoutMs / 1000}s (stalled?)`) : null;
  return async (req) => {
    const content: Record<string, unknown>[] = [];
    if (req.imageBase64 && req.imageMediaType) {
      content.push({ type: "image", source: { type: "base64", media_type: req.imageMediaType, data: req.imageBase64 } });
    }
    content.push({ type: "text", text: req.text });
    const body = JSON.stringify({ model: req.model, max_tokens: 2000, effort: cfg.effort ?? "medium", system: req.system, messages: [{ role: "user", content }] });

    let lastErr = "";
    for (let attempt = 0; attempt <= MAX_AI_RETRIES; attempt++) {
      let res: Response;
      try {
        res = await fetch(new URL("/v1/messages", cfg.baseUrl), {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" },
          body,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        const timedOut = stalled(e, req.model);
        if (timedOut) throw timedOut; // never retry
        const msg = e instanceof Error ? `${e.message}${e.cause ? ` (${String(e.cause)})` : ""}` : String(e);
        if (CONN_REFUSED_RE.test(msg)) throw new Error(`yagami unreachable (${msg}); is it running?`); // never retry
        lastErr = msg;
        if (attempt < MAX_AI_RETRIES) await sleep(backoffMs(attempt));
        continue;
      }
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        throw new Error(`model ${req.model} -> ${res.status}: ${(await res.text()).slice(0, 200)}`); // auth/bad request: fatal
      }
      if (res.status !== 200) {
        lastErr = `HTTP ${res.status}`;
        if (attempt < MAX_AI_RETRIES) await sleep(retryAfterMs(res) ?? backoffMs(attempt));
        continue;
      }
      let json: { content?: { type: string; text?: string }[] };
      try {
        json = (await res.json()) as typeof json;
      } catch (e) {
        throw stalled(e, req.model) ?? e;
      }
      const text = (json.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");
      if (OVERLOAD_RE.test(text.slice(0, 300))) {
        lastErr = `overload reply: ${text.slice(0, 120).replace(/\s+/g, " ")}`;
        if (attempt < MAX_AI_RETRIES) await sleep(backoffMs(attempt));
        continue; // never keep an overload as an answer
      }
      return text;
    }
    throw new Error(`model ${req.model} failed after ${MAX_AI_RETRIES + 1} tries: ${lastErr}`);
  };
}

/**
 * The site's Jummah is one-off events from announcements, never a series:
 * strip any recurrence from an upsert. Returns the sourceIds it changed.
 */
export function stripRecurrence(ops: Record<string, unknown>[]): string[] {
  const changed: string[] = [];
  for (const op of ops) {
    const event = op.event as Record<string, unknown> | undefined;
    if (!event) continue;
    const keys = Object.keys(event).filter((k) => /^recurr|^rrule$/i.test(k));
    for (const k of keys) delete event[k];
    if (keys.length) changed.push(String(op.sourceId));
  }
  return changed;
}

/** Exponential backoff with jitter: 1s, 2s, 4s … capped at 60s. */
function backoffMs(attempt: number): number {
  return Math.min(60_000, 1000 * 2 ** attempt) * (0.5 + Math.random() * 0.5);
}

function retryAfterMs(res: Response): number | null {
  const h = res.headers.get("retry-after-ms") ?? res.headers.get("retry-after");
  if (!h) return null;
  const n = Number(h);
  if (!Number.isFinite(n)) return null;
  return res.headers.has("retry-after-ms") ? n : Math.min(300_000, n * 1000);
}

/**
 * Is anything listening on yagami's port? A TCP connect, not an HTTP request:
 * a busy yagami can take over 10s to answer even GET /v1/models, but the
 * kernel accepts the connection at once. Down means refused (or no answer in 3s).
 */
export function yagamiUp(baseUrl: string): Promise<boolean> {
  const u = new URL(baseUrl);
  const port = Number(u.port || (u.protocol === "https:" ? 443 : 80));
  return new Promise((resolve) => {
    const sock = connect({ host: u.hostname, port });
    const done = (up: boolean) => {
      sock.destroy();
      resolve(up);
    };
    sock.setTimeout(3000, () => done(false));
    sock.once("connect", () => done(true));
    sock.once("error", () => done(false));
  });
}

/** Parse a KEY=VALUE env file (optionally `export KEY=...`), quotes stripped. */
function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

/** The AI endpoint and key: env first, then ~/.local/share/midna-ucscmsa/msa-sync.env, then config. */
function loadAiEnv(cfg: SyncConfig): { baseUrl: string; apiKey: string } {
  const envFile = expandHome(cfg.envFile ?? DEFAULT_ENV_FILE);
  let fileEnv: Record<string, string> = {};
  if (existsSync(envFile)) {
    if (statSync(envFile).mode & 0o077) throw new UsageError(`${envFile} is readable by other users; chmod 600 it`);
    fileEnv = parseEnvFile(envFile);
  }
  const baseUrl = process.env.ANTHROPIC_BASE_URL ?? fileEnv.ANTHROPIC_BASE_URL ?? cfg.aiBaseUrl ?? DEFAULT_BASE_URL;
  const apiKey = process.env.ANTHROPIC_API_KEY ?? fileEnv.ANTHROPIC_API_KEY;
  if (!apiKey) throw new UsageError(`No AI key: set ANTHROPIC_API_KEY or put ANTHROPIC_API_KEY=… in ${envFile} (chmod 600)`);
  return { baseUrl, apiKey };
}

/** Could this WhatsApp message be an announcement worth eventifying? */
function fromAnnouncer(m: WaMessage): boolean {
  if (m.revoked) return false;
  if (m.replyTo) return false; // a reply under an announcement, not an announcement
  if (m.type === "poll") return false;
  return m.sender.admin; // announcements come from board admins
}

/**
 * Announcements grouped into posts, the way they were sent: each text or
 * captioned message, with the uncaptioned images the same person sent within
 * `windowSec` (10 minutes) of it, nearest message wins. Uncaptioned images
 * with no such message form their own post: one per run of images a sender
 * sent within a minute of each other (an album), anchored on its first image. So an album is one post, not one
 * per image, and a flyer sent apart from its text joins that text.
 */
export function groupPosts(announcements: WaMessage[], windowSec = 600): { anchor: WaMessage; images: WaMessage[] }[] {
  const bare = (m: WaMessage) => m.type === "image" && !(m.caption ?? "").trim();
  const anchors = announcements.filter((m) => !bare(m));
  const posts = new Map<string, { anchor: WaMessage; images: WaMessage[] }>();
  for (const a of anchors) posts.set(a.id, { anchor: a, images: a.type === "image" ? [a] : [] });
  const albums: { anchor: WaMessage; images: WaMessage[] }[] = [];
  for (const m of [...announcements.filter(bare)].sort((x, y) => x.time.unix - y.time.unix)) {
    let best: WaMessage | null = null;
    for (const a of anchors) {
      if (a.sender.jid !== m.sender.jid) continue;
      const d = Math.abs(a.time.unix - m.time.unix);
      if (d <= windowSec && (!best || d < Math.abs(best.time.unix - m.time.unix))) best = a;
    }
    if (best) {
      posts.get(best.id)!.images.push(m);
      continue;
    }
    const album = albums.find((p) => p.anchor.sender.jid === m.sender.jid && m.time.unix - p.images[p.images.length - 1].time.unix <= 60);
    if (album) album.images.push(m);
    else {
      const post = { anchor: m, images: [m] };
      albums.push(post);
      posts.set(`album:${m.id}`, post);
    }
  }
  return [...posts.values()].sort((x, y) => x.anchor.time.unix - y.anchor.time.unix);
}

export type SyncSummary = {
  waRead: number;
  flyersMatched: number;
  flyersUnmatched: number;
  candidates: number;
  created: string[];
  updated: string[];
  unchanged: string[];
  needsReview: { sourceId: string; title?: string; notes: string[] }[];
  skipped: { sourceId: string; reason: string }[];
  errors: string[];
  /** Per posted event: links and flyer images, held for the upload once the API takes them. */
  enrichment: { sourceId: string; links: LinkEntry[]; images: string[] }[];
  /** --images: folder images matched to an announcement, added to that event's images. */
  imagesMatched: { sourceId: string; file: string }[];
  /** The flyer upload step's summary lines, when it ran. */
  imageLines?: string[];
};

/**
 * Eventify each new/changed source item and return the operations to post,
 * recording outcomes in the summary. Pure except the injected `call`; the
 * scrape step is done by the caller and passed in.
 */
export async function eventifyItems(
  items: SourceItem[],
  state: SyncState,
  opts: { call: CallModel; primaryModel: string; verifierModel: string; confidenceFloor?: number; summary: SyncSummary },
): Promise<Record<string, unknown>[]> {
  const ops: Record<string, unknown>[] = [];
  for (const item of items) {
    try {
      const draft = await eventify(item, opts);
      if (!draft.isEvent && draft.cancelsJummah) {
        // "No Jummah this Friday": cancel the one-off we posted for that date, if any.
        const target = state.jummah?.[draft.cancelsJummah];
        if (target) {
          ops.push({ op: "cancel", sourceId: target });
          opts.summary.updated.push(`${target} (Jummah ${draft.cancelsJummah} cancelled)`);
        } else {
          opts.summary.skipped.push({ sourceId: item.sourceId, reason: `Jummah cancellation for ${draft.cancelsJummah}: no Jummah event on file` });
        }
        state.processed[item.sourceId] = { hash: itemHash(item), status: "skipped" };
        continue;
      }
      if (!draft.isEvent) {
        opts.summary.skipped.push({ sourceId: item.sourceId, reason: draft.skipReason ?? "not an event" });
        state.processed[item.sourceId] = { hash: itemHash(item), status: "skipped" };
        continue;
      }
      if (draft.needsReview) {
        opts.summary.needsReview.push({ sourceId: item.sourceId, title: draft.title, notes: draft.reviewNotes });
        state.processed[item.sourceId] = { hash: itemHash(item), status: "needs-review" };
        continue;
      }
      ops.push(draftToOperation(draft));
      if (draft.isJummah && draft.date) (state.jummah ??= {})[draft.date] = item.sourceId;
      const wasPosted = state.processed[item.sourceId]?.status === "posted";
      (wasPosted ? opts.summary.updated : opts.summary.created).push(item.sourceId);
      if (draft.links.length || draft.images.length) opts.summary.enrichment.push({ sourceId: item.sourceId, links: draft.links, images: draft.images });
      state.processed[item.sourceId] = { hash: itemHash(item), status: "posted" };
    } catch (e) {
      opts.summary.errors.push(`${item.sourceId}: ${(e as Error).message}`);
    }
  }
  return ops;
}

const itemHash = (item: SourceItem) => contentHash(item.text ?? "", (item.imagePaths ?? []).join("|"));

function parseArgs(argv: string[]) {
  const has = (f: string) => argv.includes(f);
  const val = (f: string) => {
    const i = argv.indexOf(f);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    dryRun: has("--dry-run"),
    since: val("--since"),
    config: val("--config"),
    syncConfig: val("--sync-config") ?? DEFAULT_SYNC_CONFIG,
    images: val("--images"),
  };
}

export async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const err = (s: string) => process.stderr.write(`${s}\n`);
  let waConfig: Config;
  let syncCfg: SyncConfig;
  try {
    waConfig = loadConfig(args.config ?? process.env.WA_ANNOUNCEMENTS_CONFIG ?? "~/.local/share/midna-ucscmsa/ucscmsa-wa.json");
    syncCfg = loadSyncConfig(args.syncConfig);
  } catch (e) {
    err((e as Error).message);
    return 2;
  }
  if (!waConfig.chatJid) {
    err("No chatJid in the WhatsApp config; can't read the announcements chat");
    return 2;
  }
  const chatJid = waConfig.chatJid;
  const statePath = syncCfg.stateFile ?? DEFAULT_SYNC_STATE;
  const reviewPath = syncCfg.reviewFile ?? DEFAULT_REVIEW_FILE;
  const flyerDir = expandHome(syncCfg.flyerDir ?? DEFAULT_FLYER_DIR);
  const state = loadSyncState(statePath);
  const summary: SyncSummary = { waRead: 0, flyersMatched: 0, flyersUnmatched: 0, candidates: 0, created: [], updated: [], unchanged: [], needsReview: [], skipped: [], errors: [], enrichment: [], imagesMatched: [] };
  const enrichmentPath = expandHome("~/.local/share/midna-ucscmsa/ucscmsa-sync-enrichment.json");

  // --- 1. SCRAPE WhatsApp + match flyers from the folder ---
  const since = args.since ? new Date(args.since) : state.lastWaUnix ? new Date(state.lastWaUnix * 1000 + 1000) : new Date("2025-11-01T00:00:00-07:00");
  const items: SourceItem[] = [];
  let maxWaUnix = state.lastWaUnix ?? 0;
  // --images: the folder's new or changed images, and every announcement near their dates.
  let newImages: DatedImage[] = [];
  let imageCandidates: Candidate[] = [];
  const imageKey = (f: string) => {
    const st = statSync(f);
    return `${st.size}:${Math.floor(st.mtimeMs)}`;
  };
  if (args.images) {
    try {
      const folder = indexImageFolder(expandHome(args.images));
      newImages = folder.images.filter((i) => state.images?.[i.file]?.key !== imageKey(i.file));
      for (const f of folder.unsupported) summary.needsReview.push({ sourceId: `image:${f}`, notes: ["not a JPEG/PNG/WebP image; export it as JPEG to match it"] });
    } catch (e) {
      summary.errors.push(`--images ${args.images}: ${(e as Error).message}`);
    }
  }
  try {
    const mediaDir = join(expandHome(waConfig.dbDir), "Message");
    const imagesSince = newImages.length ? new Date((Math.min(...newImages.map((i) => i.unix)) - 14 * 86400) * 1000) : null;
    const { messages, nearImages } = await withDbCopy(expandHome(waConfig.dbDir), openWithBunSqlite, (db) =>
      Promise.resolve({
        messages: readMessages(db, { chatJid, since, state: null, mediaDir }).messages,
        nearImages: imagesSince ? readMessages(db, { chatJid, since: imagesSince, state: null, mediaDir }).messages : [],
      }),
    );
    imageCandidates = nearImages.filter(fromAnnouncer).map((m) => ({ sourceId: m.sourceId, unix: m.time.unix, text: m.text ?? m.caption ?? "" })).filter((c) => c.text.trim());
    summary.waRead = messages.length;
    const announcements = messages.filter(fromAnnouncer);
    // Match Justin's saved flyers to announcements by timestamp.
    const flyers = indexFlyers(flyerDir);
    const { byMessage, unmatched } = assignFlyers(flyers, announcements.map((m) => m.time.unix));
    summary.flyersMatched = flyers.length - unmatched.length;
    summary.flyersUnmatched = unmatched.length;

    for (const m of messages) maxWaUnix = Math.max(maxWaUnix, m.time.unix);
    // Each image's folder flyer(s), else WhatsApp's own downloaded copy if there is one.
    const flyersOf = (img: WaMessage) => byMessage.get(img.time.unix) ?? (img.mediaPath ? [img.mediaPath] : []);
    for (const { anchor: m, images } of groupPosts(announcements)) {
      const flyerPaths = [...new Set(images.flatMap(flyersOf))];
      const text = m.text ?? m.caption ?? "";
      if (!text.trim() && flyerPaths.length === 0) continue; // nothing to read
      summary.candidates++;
      const h = contentHash(text, flyerPaths.join("|"));
      if (state.processed[m.sourceId]?.hash === h) {
        summary.unchanged.push(m.sourceId);
        continue;
      }
      const img = imageForPath(flyerPaths[0]);
      items.push({
        sourceId: m.sourceId,
        sourceRef: `WhatsApp MSA announcements, ${m.time.santaCruz.slice(0, 16).replace("T", " ")}`,
        sentDate: m.time.santaCruz.slice(0, 10),
        text,
        imageBase64: img?.imageBase64 ?? null,
        imageMediaType: img?.imageMediaType ?? null,
        imagePaths: flyerPaths,
      });
    }
  } catch (e) {
    summary.errors.push(`whatsapp scrape: ${(e as Error).message}`);
  }

  // --- 2. EVENTIFY ---
  let ops: Record<string, unknown>[] = [];
  if (items.length || newImages.length) {
    let ai: { baseUrl: string; apiKey: string };
    try {
      ai = loadAiEnv(syncCfg);
    } catch (e) {
      err((e as Error).message);
      return 2;
    }
    // yagami must be up before we eventify or post anything.
    if (!(await yagamiUp(ai.baseUrl))) {
      summary.errors.push(`the AI endpoint at ${ai.baseUrl} is not reachable (yagami down?); nothing was eventified or posted`);
      printSummary(summary, args.dryRun, process.stdout.write.bind(process.stdout));
      return 1;
    }
    const call = yagamiCall({ baseUrl: ai.baseUrl, apiKey: ai.apiKey, effort: syncCfg.aiEffort });
    ops = await eventifyItems(items, state, { call, primaryModel: syncCfg.aiModel, verifierModel: syncCfg.aiVerifierModel, confidenceFloor: syncCfg.confidenceFloor, summary });
    if (newImages.length) {
      const res = await matchImages(newImages, imageCandidates, { call, model: syncCfg.aiModel, load: imageForPath });
      state.images ??= {};
      for (const m of res.matched) {
        summary.imagesMatched.push({ sourceId: m.sourceId, file: m.file });
        state.images[m.file] = { key: imageKey(m.file), sourceId: m.sourceId };
      }
      for (const r of res.review) {
        summary.needsReview.push({ sourceId: `image:${r.file}`, notes: [r.note] });
        state.images[r.file] = { key: imageKey(r.file), sourceId: null };
      }
      for (const e of res.errors) summary.errors.push(`image ${e.file}: ${e.error}`);
    }
  }

  // --- 3. POST ---
  for (const sid of stripRecurrence(ops)) summary.needsReview.push({ sourceId: sid, notes: ["a recurrence was stripped: msa-sync posts one-off events only"] });
  let exit = summary.errors.length ? 1 : 0;
  if (ops.length) {
    const tmp = mkdtempSync(join(tmpdir(), "msa-sync-batch-"));
    const batchPath = join(tmp, "batch.json");
    writeFileSync(batchPath, JSON.stringify({ source: "whatsapp", operations: ops }, null, 2), { mode: 0o600 });
    try {
      const code = await runImport({
        batchPath,
        dryRun: args.dryRun,
        baseUrl: waConfig.baseUrl,
        tokenFile: waConfig.tokenFile,
        out: (s) => process.stdout.write(`${s}\n`),
        err,
      });
      if (code !== 0) exit = code;
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  // --- 4. FLYERS: upload and attach the posted events' images ---
  // Until the image release is live this only reports them as held; a dry
  // run plans offline (its events weren't really posted).
  const withImages = summary.enrichment.filter((e) => e.images.length).map((e) => ({ sourceId: e.sourceId, files: e.images }));
  if (withImages.length && exit === 0) {
    try {
      const res = await runImageSync(withImages, {
        dryRun: args.dryRun,
        offline: args.dryRun,
        put: imagesClient({ baseUrl: waConfig.baseUrl, token: readToken(waConfig.tokenFile) }),
        upload: args.dryRun ? null : lazyBlobUpload(),
      });
      summary.imageLines = summarize(res, args.dryRun);
      for (const o of res.outcomes) {
        if (o.status === "error") summary.errors.push(`flyers ${o.sourceId}: ${o.note ?? "error"}`);
        if (o.status === "conflict" || o.status === "not_found") summary.needsReview.push({ sourceId: o.sourceId, notes: [`flyers not attached: ${o.status} ${o.note ?? ""}`.trim()] });
      }
    } catch (e) {
      summary.errors.push(`flyers: ${(e as Error).message}`);
    }
    if (summary.errors.length) exit = 1;
  }

  // --- persist state (not on dry run) and the review file ---
  if (!args.dryRun) {
    state.lastWaUnix = maxWaUnix || state.lastWaUnix;
    saveSyncState(statePath, state);
  }
  if (summary.needsReview.length) {
    writeFileSync(expandHome(reviewPath), JSON.stringify(summary.needsReview, null, 2), { mode: 0o600 });
  }
  if (!args.dryRun && (summary.enrichment.length || summary.imagesMatched.length)) {
    const prior: Record<string, { links: LinkEntry[]; images: string[] }> = existsSync(enrichmentPath) ? JSON.parse(readFileSync(enrichmentPath, "utf8")) : {};
    for (const e of summary.enrichment) prior[e.sourceId] = { links: e.links, images: e.images };
    for (const m of summary.imagesMatched) {
      const entry = (prior[m.sourceId] ??= { links: [], images: [] });
      if (!entry.images.includes(m.file)) entry.images.push(m.file); // added after the event's own flyers
    }
    writeFileSync(enrichmentPath, JSON.stringify(prior, null, 2), { mode: 0o600 });
  }

  printSummary(summary, args.dryRun, process.stdout.write.bind(process.stdout));
  return exit;
}

function printSummary(s: SyncSummary, dryRun: boolean, write: (b: string) => void): void {
  const lines = [
    "",
    `MSA sync summary${dryRun ? " (dry run)" : ""}:`,
    `  WhatsApp messages read: ${s.waRead}; flyers matched: ${s.flyersMatched} (${s.flyersUnmatched} unmatched); candidates: ${s.candidates}`,
    ...(s.imagesMatched.length ? [`  --images matched: ${s.imagesMatched.length} (${s.imagesMatched.map((m) => `${m.file.split("/").pop()} -> ${m.sourceId}`).join(", ")})`] : []),
    `  created: ${s.created.length}  updated: ${s.updated.length}  unchanged: ${s.unchanged.length}  needs-review: ${s.needsReview.length}  skipped: ${s.skipped.length}  errors: ${s.errors.length}`,
  ];
  if (s.imageLines) lines.push(...s.imageLines.map((l) => `  ${l}`));
  if (s.needsReview.length) {
    lines.push("  needs review:");
    for (const r of s.needsReview) lines.push(`    ${r.sourceId} ${r.title ?? ""} — ${r.notes.join("; ")}`);
  }
  if (s.errors.length) {
    lines.push("  errors:");
    for (const e of s.errors) lines.push(`    ${e}`);
  }
  write(`${lines.join("\n")}\n`);
}

if ((import.meta as { main?: boolean }).main) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
