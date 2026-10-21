// The daily MSA sync pipeline. One command:
//   1. SCRAPE (plain code): new WhatsApp announcements since the last run, and
//      (secondary) new Instagram image posts. WhatsApp is the primary source.
//   2. EVENTIFY (an LLM through yagami): turn each new item + its flyer into an
//      event JSON. Never invents a time; low-confidence items go to review.
//   3. POST: the import API, idempotent on stable wa:/ig: ids.
// State, summary and the review file live in ~/.config/midna. A normal run
// posts; --dry-run previews. Non-zero exit on any error.
//
// Usage:
//   bun scripts/msa-sync.ts [--dry-run] [--no-instagram] [--since <ISO>]
//                           [--config <wa.json>] [--sync-config <sync.json>]

import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { draftToOperation, eventify, type CallModel, type SourceItem } from "./eventify";
import { fetchInstagramPosts, IgStop, type IgPost } from "./ig-posts";
import {
  expandHome,
  loadConfig,
  openWithBunSqlite,
  readMessages,
  runImport,
  UsageError,
  withDbCopy,
  type Config,
  type WaMessage,
} from "./wa-announcements";

const DEFAULT_SYNC_CONFIG = "~/.config/midna/ucscmsa-sync.json";
const DEFAULT_SYNC_STATE = "~/.config/midna/ucscmsa-sync-state.json";
const DEFAULT_REVIEW_FILE = "~/.config/midna/ucscmsa-sync-review.json";
const DEFAULT_IG_DIR = "~/.config/midna/ucscmsa-ig";

const syncConfigSchema = z.object({
  aiBaseUrl: z.string().url().optional(),
  aiKeyFile: z.string().optional(),
  aiModel: z.string().default("claude-haiku-5-5"),
  aiVerifierModel: z.string().default("claude-sonnet-5-5"),
  confidenceFloor: z.number().min(0).max(1).optional(),
  instagramUsername: z.string().default("ucsc.msa"),
  instagramDir: z.string().optional(),
  stateFile: z.string().optional(),
  reviewFile: z.string().optional(),
});
export type SyncConfig = z.infer<typeof syncConfigSchema>;

export type SyncState = {
  version: 1;
  lastWaUnix: number | null;
  lastIgTakenAt: number | null;
  /** sourceId -> last content hash we eventified, and what became of it. */
  processed: Record<string, { hash: string; status: string }>;
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
  if (!existsSync(p)) return { version: 1, lastWaUnix: null, lastIgTakenAt: null, processed: {} };
  return JSON.parse(readFileSync(p, "utf8")) as SyncState;
}

export function saveSyncState(path: string, state: SyncState): void {
  const p = expandHome(path);
  writeFileSync(`${p}.tmp`, JSON.stringify(state, null, 2), { mode: 0o600 });
  renameSync(`${p}.tmp`, p); // atomic replace
}

const contentHash = (text: string, hasImage: boolean) =>
  createHash("sha256").update(JSON.stringify([text, hasImage])).digest("hex").slice(0, 16);

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

/** A real yagami/Anthropic call: raw POST to <base>/v1/messages. */
export function yagamiCall(cfg: { baseUrl: string; apiKey: string }): CallModel {
  return async (req) => {
    const content: Record<string, unknown>[] = [];
    if (req.imageBase64 && req.imageMediaType) {
      content.push({ type: "image", source: { type: "base64", media_type: req.imageMediaType, data: req.imageBase64 } });
    }
    content.push({ type: "text", text: req.text });
    const res = await fetch(new URL("/v1/messages", cfg.baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: req.model, max_tokens: 2000, system: req.system, messages: [{ role: "user", content }] }),
    });
    if (!res.ok) throw new Error(`model ${req.model} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    return (body.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");
  };
}

function readApiKey(cfg: SyncConfig): string {
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey) return envKey;
  if (cfg.aiKeyFile) {
    const p = expandHome(cfg.aiKeyFile);
    if (existsSync(p)) {
      if (statSync(p).mode & 0o077) throw new UsageError(`${p} is readable by other users; chmod 600 it`);
      return readFileSync(p, "utf8").trim();
    }
  }
  throw new UsageError("No AI key: set ANTHROPIC_API_KEY or aiKeyFile in the sync config");
}

/** Is this WhatsApp message a candidate to eventify at all? */
function isCandidate(m: WaMessage): boolean {
  if (m.revoked) return false;
  if (m.replyTo) return false; // a reply under an announcement, not an announcement
  if (m.type === "poll") return false;
  if (!m.sender.admin) return false; // announcements come from board admins
  const hasText = !!(m.text && m.text.trim());
  const hasFlyer = !!m.mediaPath;
  return hasText || hasFlyer;
}

export type SyncSummary = {
  waRead: number;
  igRead: number;
  candidates: number;
  created: string[];
  updated: string[];
  unchanged: string[];
  needsReview: { sourceId: string; title?: string; notes: string[] }[];
  skipped: { sourceId: string; reason: string }[];
  errors: string[];
};

/**
 * Collect the new/changed source items (WhatsApp, then Instagram), eventify
 * each, and return the operations to post plus the summary. Pure except the
 * injected `call`; the scrape steps are done by the caller and passed in.
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
      const wasPosted = state.processed[item.sourceId]?.status === "posted";
      (wasPosted ? opts.summary.updated : opts.summary.created).push(item.sourceId);
      state.processed[item.sourceId] = { hash: itemHash(item), status: "posted" };
    } catch (e) {
      opts.summary.errors.push(`${item.sourceId}: ${(e as Error).message}`);
    }
  }
  return ops;
}

const itemHash = (item: SourceItem) => contentHash(item.text ?? "", !!item.imageBase64);

function parseArgs(argv: string[]) {
  const has = (f: string) => argv.includes(f);
  const val = (f: string) => {
    const i = argv.indexOf(f);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    dryRun: has("--dry-run"),
    noInstagram: has("--no-instagram"),
    since: val("--since"),
    config: val("--config"),
    syncConfig: val("--sync-config") ?? DEFAULT_SYNC_CONFIG,
  };
}

export async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const err = (s: string) => process.stderr.write(`${s}\n`);
  let waConfig: Config;
  let syncCfg: SyncConfig;
  try {
    waConfig = loadConfig(args.config ?? process.env.WA_ANNOUNCEMENTS_CONFIG ?? "~/.config/midna/ucscmsa-wa.json");
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
  const igDir = expandHome(syncCfg.instagramDir ?? DEFAULT_IG_DIR);
  const state = loadSyncState(statePath);
  const summary: SyncSummary = { waRead: 0, igRead: 0, candidates: 0, created: [], updated: [], unchanged: [], needsReview: [], skipped: [], errors: [] };

  // --- 1. SCRAPE WhatsApp (primary) ---
  const since = args.since ? new Date(args.since) : state.lastWaUnix ? new Date(state.lastWaUnix * 1000 + 1000) : new Date("2025-11-01T00:00:00-07:00");
  const items: SourceItem[] = [];
  let maxWaUnix = state.lastWaUnix ?? 0;
  try {
    const { messages } = await withDbCopy(expandHome(waConfig.dbDir), openWithBunSqlite, (db) =>
      Promise.resolve(readMessages(db, { chatJid, since, state: null, mediaDir: join(expandHome(waConfig.dbDir), "Message") })),
    );
    summary.waRead = messages.length;
    for (const m of messages) {
      maxWaUnix = Math.max(maxWaUnix, m.time.unix);
      if (!isCandidate(m)) continue;
      summary.candidates++;
      const h = contentHash(m.text ?? m.caption ?? "", !!m.mediaPath);
      if (state.processed[m.sourceId]?.hash === h) {
        summary.unchanged.push(m.sourceId);
        continue;
      }
      const img = imageForPath(m.mediaPath);
      items.push({
        sourceId: m.sourceId,
        sourceRef: `WhatsApp MSA announcements, ${m.time.santaCruz.slice(0, 16).replace("T", " ")}`,
        sentDate: m.time.santaCruz.slice(0, 10),
        text: m.text ?? m.caption ?? "",
        imageBase64: img?.imageBase64 ?? null,
        imageMediaType: img?.imageMediaType ?? null,
      });
    }
  } catch (e) {
    summary.errors.push(`whatsapp scrape: ${(e as Error).message}`);
  }

  // --- 1b. SCRAPE Instagram (secondary, degrade gracefully) ---
  let maxIgTakenAt = state.lastIgTakenAt ?? 0;
  if (!args.noInstagram) {
    const igSince = state.lastIgTakenAt ? new Date(state.lastIgTakenAt * 1000 + 1000) : new Date("2025-09-01T00:00:00-07:00");
    try {
      const posts = await fetchInstagramPosts({ username: syncCfg.instagramUsername, since: igSince, outDir: igDir, log: (s) => err(`  ig: ${s}`) });
      summary.igRead = posts.length;
      for (const post of posts) {
        maxIgTakenAt = Math.max(maxIgTakenAt, post.takenAt);
        const item = igPostToItem(post, igDir, state);
        if (item) {
          summary.candidates++;
          items.push(item);
        }
      }
    } catch (e) {
      if (e instanceof IgStop) summary.errors.push(`instagram stopped (not retried): ${e.message}`);
      else summary.errors.push(`instagram scrape: ${(e as Error).message}`);
    }
  }

  // --- 2. EVENTIFY ---
  let ops: Record<string, unknown>[] = [];
  if (items.length) {
    let call: CallModel;
    try {
      call = yagamiCall({ baseUrl: syncCfg.aiBaseUrl ?? process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com", apiKey: readApiKey(syncCfg) });
    } catch (e) {
      err((e as Error).message);
      return 2;
    }
    ops = await eventifyItems(items, state, { call, primaryModel: syncCfg.aiModel, verifierModel: syncCfg.aiVerifierModel, confidenceFloor: syncCfg.confidenceFloor, summary });
  }

  // --- 3. POST ---
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

  // --- persist state (not on dry run) and the review file ---
  if (!args.dryRun) {
    state.lastWaUnix = maxWaUnix || state.lastWaUnix;
    state.lastIgTakenAt = maxIgTakenAt || state.lastIgTakenAt;
    saveSyncState(statePath, state);
  }
  if (summary.needsReview.length) {
    writeFileSync(expandHome(reviewPath), JSON.stringify(summary.needsReview, null, 2), { mode: 0o600 });
  }

  printSummary(summary, args.dryRun, process.stdout.write.bind(process.stdout));
  return exit;
}

function igPostToItem(post: IgPost, igDir: string, state: SyncState): SourceItem | null {
  const sourceId = `ig:${post.shortcode}`;
  const h = contentHash(post.caption, post.images.length > 0);
  if (state.processed[sourceId]?.hash === h) return null; // unchanged
  const imgPath = post.images[0] ? join(igDir, post.images[0]) : null;
  const img = imageForPath(imgPath);
  return {
    sourceId,
    sourceRef: post.url,
    sentDate: post.date.slice(0, 10),
    text: post.caption,
    imageBase64: img?.imageBase64 ?? null,
    imageMediaType: img?.imageMediaType ?? null,
  };
}

function printSummary(s: SyncSummary, dryRun: boolean, write: (b: string) => void): void {
  const lines = [
    "",
    `MSA sync summary${dryRun ? " (dry run)" : ""}:`,
    `  WhatsApp messages read: ${s.waRead}; Instagram posts read: ${s.igRead}; candidates: ${s.candidates}`,
    `  created: ${s.created.length}  updated: ${s.updated.length}  unchanged: ${s.unchanged.length}  needs-review: ${s.needsReview.length}  skipped: ${s.skipped.length}  errors: ${s.errors.length}`,
  ];
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
