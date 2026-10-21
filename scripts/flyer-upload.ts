// Uploads matched flyers to the site's Vercel Blob store and attaches them to
// their imported events, as docs/import.md ("Images") describes. Per event:
//   1. each new image, metadata stripped (auto-rotated, at most 2000 px,
//      re-encoded as JPEG), to flyers/<eventId>/<id>.jpg, where id is the
//      first 16 hex digits of the uploaded bytes' SHA-256;
//   2. PUT /api/import/events/images with the event's whole ordered list.
// The originals are only read. The event id and the attached image ids per
// sourceId are kept in ~/.local/share/midna-ucscmsa/ucscmsa-images-state.json,
// so a re-run uploads and sends nothing for an event that's already done.
//
// Inputs: ucscmsa-flyer-map.json (the history) and ucscmsa-sync-enrichment.json
// (what msa-sync posted). msa-sync calls runImageSync for its new events too.
//
// Usage:
//   bun scripts/flyer-upload.ts [--dry-run] [--only <sourceId>] [--config <wa.json>]

import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { DEFAULT_CONFIG_PATH, expandHome, loadConfig, readToken, UsageError } from "./wa-announcements";

const HOME = "~/.local/share/midna-ucscmsa";
const DEFAULT_MAP = `${HOME}/ucscmsa-flyer-map.json`;
const DEFAULT_ENRICHMENT = `${HOME}/ucscmsa-sync-enrichment.json`;
const DEFAULT_HISTORY_EVENTS = `${HOME}/ucscmsa-history-events.json`;
const DEFAULT_IMAGES_STATE = `${HOME}/ucscmsa-images-state.json`;
const DEFAULT_IMAGES_REVIEW = `${HOME}/ucscmsa-images-review.json`;
const DEFAULT_BLOB_TOKEN = `${HOME}/blob-token`;
const MAX_IMAGES = 10;
const MAX_SIDE = 2000;

export type Prepared = { file: string; id: string; bytes: Buffer };

/** Strip metadata (EXIF, GPS): auto-rotate, fit within 2000 px, re-encode as JPEG. */
export async function prepareImage(file: string): Promise<Prepared> {
  const bytes = await sharp(file)
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer(); // sharp keeps no metadata unless asked to
  return { file, id: createHash("sha256").update(bytes).digest("hex").slice(0, 16), bytes };
}

export type ImagesResponse = {
  ok?: boolean;
  status?: "updated" | "unchanged" | "conflict" | "not_found";
  reason?: string;
  eventId?: string;
  images?: { id: string; card?: { url: string }; page?: { url: string }; full?: { url: string } }[];
  error?: string;
  message?: string;
};
export type PutImages = (body: Record<string, unknown>) => Promise<{ httpStatus: number; json: ImagesResponse }>;
export type Upload = (path: string, bytes: Buffer) => Promise<string>;

/** The image endpoint isn't deployed (404) or has no Blob token (503): nothing can be attached yet. */
export class ImagesNotLive extends Error {}

export type ImageState = Record<string, { eventId: string; ids: string[]; sent: string[] }>;

export type EventOutcome = {
  sourceId: string;
  status: "attached" | "unchanged" | "would-attach" | "not_found" | "conflict" | "error";
  uploaded: number;
  uploadedBytes: number;
  lines: string[];
  note?: string;
  images?: ImagesResponse["images"];
};

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Attach one event's flyers. Uploads only images the event doesn't already
 * have, then sends the whole ordered list. A dry run finds the event and
 * lists what would go where, uploading and changing nothing.
 */
export async function syncEventImages(
  sourceId: string,
  files: string[],
  state: ImageState,
  deps: { put: PutImages; upload: Upload | null; prepare?: (file: string) => Promise<Prepared>; dryRun: boolean; titles?: Record<string, string>; offline?: boolean },
): Promise<EventOutcome> {
  const prepare = deps.prepare ?? prepareImage;
  const out: EventOutcome = { sourceId, status: "error", uploaded: 0, uploadedBytes: 0, lines: [] };
  const prepared: Prepared[] = [];
  for (const f of files) {
    const p = await prepare(f);
    if (!prepared.some((q) => q.id === p.id)) prepared.push(p); // the same picture twice is kept once
  }
  if (prepared.length > MAX_IMAGES) {
    out.lines.push(`only the first ${MAX_IMAGES} of ${prepared.length} images are sent`);
    prepared.length = MAX_IMAGES;
  }
  const desired = prepared.map((p) => p.id);
  const known = state[sourceId];
  if (known && same(known.sent, desired)) return { ...out, status: "unchanged" };

  let eventId = known?.eventId;
  if (!eventId && deps.offline) eventId = "<eventId>"; // a dry run before the endpoint is live: plan without asking
  if (!eventId) {
    const probe = await deps.put({ source: "whatsapp", sourceId, images: [], dryRun: true });
    if (probe.httpStatus === 404 || probe.httpStatus === 503) throw new ImagesNotLive(`image endpoint answered ${probe.httpStatus}${probe.json.error ? ` ${probe.json.error}` : ""}`);
    if (probe.json.status === "not_found") return { ...out, status: "not_found", note: "no imported event with this sourceId" };
    if (!probe.json.eventId) return { ...out, status: probe.json.status === "conflict" ? "conflict" : "error", note: probe.json.reason ?? probe.json.error ?? `HTTP ${probe.httpStatus}` };
    eventId = probe.json.eventId;
  }

  const title = deps.titles?.[sourceId];
  const alt = (i: number) => (title ? `${title} flyer${prepared.length > 1 ? ` (${i + 1} of ${prepared.length})` : ""}`.slice(0, 300) : undefined);
  const have = new Set(known?.ids ?? []);
  type Step = { keep: string; alt?: string } | { prep: Prepared; path: string; alt?: string };
  const plan: Step[] = prepared.map((p, i) => (have.has(p.id) ? { keep: p.id, alt: alt(i) } : { prep: p, path: `flyers/${eventId}/${p.id}.jpg`, alt: alt(i) }));
  for (const step of plan) {
    out.lines.push("keep" in step ? `keep ${step.keep}` : `${step.prep.file.split("/").pop()} -> ${step.path} (${Math.round(step.prep.bytes.length / 1024)} KB)`);
  }
  if (deps.dryRun) return { ...out, status: "would-attach", uploadedBytes: plan.reduce((n, s) => n + ("prep" in s ? s.prep.bytes.length : 0), 0) };

  if (!deps.upload) throw new UsageError("no Blob uploader");
  const images: Record<string, unknown>[] = [];
  for (const step of plan) {
    if ("keep" in step) {
      images.push({ id: step.keep, ...(step.alt ? { alt: step.alt } : {}) });
      continue;
    }
    const url = await deps.upload(step.path, step.prep.bytes);
    out.uploaded++;
    out.uploadedBytes += step.prep.bytes.length;
    images.push({ url, ...(step.alt ? { alt: step.alt } : {}) });
  }
  const res = await deps.put({ source: "whatsapp", sourceId, images });
  if (res.httpStatus === 404 || res.httpStatus === 503) throw new ImagesNotLive(`image endpoint answered ${res.httpStatus}`);
  const st = res.json.status;
  if (res.httpStatus === 200 && (st === "updated" || st === "unchanged")) {
    state[sourceId] = { eventId, ids: (res.json.images ?? []).map((i) => i.id), sent: desired };
    return { ...out, status: st === "updated" ? "attached" : "unchanged", images: res.json.images };
  }
  if (st === "conflict") return { ...out, status: "conflict", note: res.json.reason ?? "conflict" };
  if (st === "not_found") return { ...out, status: "not_found", note: "the event is gone" };
  return { ...out, status: "error", note: `HTTP ${res.httpStatus} ${res.json.error ?? ""} ${res.json.message ?? ""}`.trim() };
}

const nap = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * PUT /api/import/events/images with the import token. Paced to the
 * endpoint's limit (60 per 10 minutes), and a 429 waits out Retry-After.
 */
export function imagesClient(o: { baseUrl: string; token: string; minGapMs?: number; sleep?: (ms: number) => Promise<void> }): PutImages {
  const sleep = o.sleep ?? nap;
  const gap = o.minGapMs ?? 10_500;
  const url = new URL("/api/import/events/images", o.baseUrl);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) throw new UsageError(`Refusing to send the token to ${url.origin}`);
  let last = 0;
  return async (body) => {
    for (let attempt = 0; ; attempt++) {
      const wait = last + gap - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
      const res = await fetch(url, { method: "PUT", headers: { authorization: `Bearer ${o.token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
      if (res.status === 429 && attempt < 3) {
        const ra = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 900) * 1000 : 60_000);
        continue;
      }
      const json = (await res.json().catch(() => ({}))) as ImagesResponse;
      return { httpStatus: res.status, json };
    }
  };
}

/** The Blob uploader. @vercel/blob arrives with the image release: merge it before a real run. */
export async function blobUploader(token: string): Promise<Upload> {
  const spec = "@vercel/blob"; // not a dependency of this branch until the image release is merged
  let mod: { put: (path: string, body: Buffer, opts: Record<string, unknown>) => Promise<{ url: string }> };
  try {
    mod = await import(spec);
  } catch {
    throw new UsageError("@vercel/blob isn't installed here: merge the image release (master) into this branch, then bun install");
  }
  return async (path, bytes) =>
    (await mod.put(path, bytes, { access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "image/jpeg", token })).url;
}

/** The Blob uploader, loaded on the first upload: a run that uploads nothing needs no token or package. */
export function lazyBlobUpload(): Upload {
  let real: Promise<Upload> | null = null;
  return async (path, bytes) => (await (real ??= blobUploader(loadBlobToken())))(path, bytes);
}

/** The Blob token: BLOB_READ_WRITE_TOKEN, else ~/.local/share/midna-ucscmsa/blob-token (chmod 600). Never printed. */
export function loadBlobToken(path = DEFAULT_BLOB_TOKEN): string {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  const p = expandHome(path);
  if (!existsSync(p)) throw new UsageError(`No Blob token: set BLOB_READ_WRITE_TOKEN or put it in ${p} (chmod 600)`);
  if (statSync(p).mode & 0o077) throw new UsageError(`${p} is readable by other users; chmod 600 it`);
  return readFileSync(p, "utf8").trim();
}

export function loadImageState(path = DEFAULT_IMAGES_STATE): ImageState {
  const p = expandHome(path);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as ImageState) : {};
}

function saveImageState(state: ImageState, path = DEFAULT_IMAGES_STATE): void {
  const p = expandHome(path);
  writeFileSync(`${p}.tmp`, JSON.stringify(state, null, 1), { mode: 0o600 });
  renameSync(`${p}.tmp`, p);
}

export type ImageSyncSummary = { outcomes: EventOutcome[]; notLive?: string };

/**
 * Attach flyers for each entry, in order. Saves state after every attached
 * event (not on a dry run). Stops at once, with notLive set, if the endpoint
 * isn't deployed yet.
 */
export async function runImageSync(
  entries: { sourceId: string; files: string[] }[],
  o: { dryRun: boolean; put: PutImages; upload: Upload | null; titles?: Record<string, string>; statePath?: string; log?: (s: string) => void; prepare?: (file: string) => Promise<Prepared>; offline?: boolean },
): Promise<ImageSyncSummary> {
  const state = loadImageState(o.statePath);
  const outcomes: EventOutcome[] = [];
  let notLive: string | undefined = o.offline ? "not asked (offline)" : undefined;
  for (const e of entries) {
    try {
      let r: EventOutcome;
      try {
        r = await syncEventImages(e.sourceId, e.files, state, { put: o.put, upload: o.upload, dryRun: o.dryRun, titles: o.titles, prepare: o.prepare, offline: notLive !== undefined });
      } catch (err) {
        // On a dry run, keep planning without the endpoint; a real run stops.
        if (!(err instanceof ImagesNotLive) || !o.dryRun) throw err;
        notLive = err.message;
        r = await syncEventImages(e.sourceId, e.files, state, { put: o.put, upload: o.upload, dryRun: true, titles: o.titles, prepare: o.prepare, offline: true });
      }
      outcomes.push(r);
      o.log?.(`${r.status.padEnd(12)} ${e.sourceId}${r.note ? ` (${r.note})` : ""}${r.lines.length && r.status !== "unchanged" ? `\n    ${r.lines.join("\n    ")}` : ""}`);
      if (!o.dryRun && (r.status === "attached" || r.status === "unchanged")) saveImageState(state, o.statePath);
    } catch (err) {
      if (err instanceof ImagesNotLive) return { outcomes, notLive: err.message };
      outcomes.push({ sourceId: e.sourceId, status: "error", uploaded: 0, uploadedBytes: 0, lines: [], note: (err as Error).message });
      o.log?.(`error        ${e.sourceId} (${(err as Error).message})`);
    }
  }
  return { outcomes, notLive };
}

/** The flyers to attach: the history map, then what msa-sync posted. */
export function loadEntries(mapPath = DEFAULT_MAP, enrichmentPath = DEFAULT_ENRICHMENT): { sourceId: string; files: string[] }[] {
  const out = new Map<string, string[]>();
  const map = existsSync(expandHome(mapPath)) ? (JSON.parse(readFileSync(expandHome(mapPath), "utf8")) as Record<string, unknown>) : {};
  for (const [sid, files] of Object.entries(map)) if (!sid.startsWith("_") && Array.isArray(files)) out.set(sid, files as string[]);
  const enr = existsSync(expandHome(enrichmentPath)) ? (JSON.parse(readFileSync(expandHome(enrichmentPath), "utf8")) as Record<string, { images?: string[] }>) : {};
  for (const [sid, e] of Object.entries(enr)) if (e.images?.length && !out.has(sid)) out.set(sid, e.images);
  return [...out].map(([sourceId, files]) => ({ sourceId, files: files.filter((f) => /\.(jpe?g|png|webp)$/i.test(f)) })).filter((e) => e.files.length);
}

export function loadTitles(path = DEFAULT_HISTORY_EVENTS): Record<string, string> {
  const p = expandHome(path);
  if (!existsSync(p)) return {};
  return Object.fromEntries((JSON.parse(readFileSync(p, "utf8")) as { sid: string; title: string }[]).map((e) => [e.sid, e.title]));
}

/** Sum the stored WebP variants' sizes (HEAD on the public URLs). */
async function storedBytes(outcomes: EventOutcome[]): Promise<number> {
  let total = 0;
  for (const o of outcomes) {
    for (const img of o.images ?? []) {
      for (const v of [img.card, img.page, img.full]) {
        if (!v?.url) continue;
        const res = await fetch(v.url, { method: "HEAD" }).catch(() => null);
        total += Number(res?.headers.get("content-length") ?? 0);
      }
    }
  }
  return total;
}

export function summarize(s: ImageSyncSummary, dryRun: boolean): string[] {
  const count = (st: EventOutcome["status"]) => s.outcomes.filter((o) => o.status === st).length;
  const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
  const up = s.outcomes.reduce((n, o) => n + o.uploaded, 0);
  const bytes = s.outcomes.reduce((n, o) => n + o.uploadedBytes, 0);
  const lines = [
    `Flyer images${dryRun ? " (dry run)" : ""}:`,
    dryRun
      ? `  events: ${count("would-attach")} would get images (${mb(bytes)} MB to upload), ${count("unchanged")} already done`
      : `  events: ${count("attached")} attached, ${count("unchanged")} unchanged; images uploaded: ${up} (${mb(bytes)} MB)`,
    `  not found: ${count("not_found")}  conflicts: ${count("conflict")}  errors: ${count("error")}`,
  ];
  if (s.notLive) lines.push(dryRun ? `  the image endpoint isn't live yet (${s.notLive}): planned offline, <eventId> is filled in on the real run` : `  stopped: the image endpoint isn't live yet (${s.notLive}); nothing more was sent`);
  for (const o of s.outcomes.filter((x) => ["not_found", "conflict", "error"].includes(x.status))) lines.push(`    ${o.status} ${o.sourceId}: ${o.note ?? ""}`);
  return lines;
}

export async function main(argv: string[]): Promise<number> {
  const dryRun = argv.includes("--dry-run");
  const val = (f: string) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : undefined);
  const only = val("--only");
  const log = (s: string) => process.stdout.write(`${s}\n`);
  try {
    const wa = loadConfig(val("--config") ?? process.env.WA_ANNOUNCEMENTS_CONFIG ?? DEFAULT_CONFIG_PATH);
    const put = imagesClient({ baseUrl: wa.baseUrl, token: readToken(wa.tokenFile) });
    const upload = dryRun ? null : lazyBlobUpload();
    const entries = loadEntries().filter((e) => !only || e.sourceId === only);
    const summary = await runImageSync(entries, { dryRun, put, upload, titles: loadTitles(), log });
    for (const l of summarize(summary, dryRun)) log(l);
    if (!dryRun) {
      const stored = await storedBytes(summary.outcomes);
      if (stored) log(`  stored on the site (WebP variants of the images attached this run): ${(stored / 1024 / 1024).toFixed(1)} MB`);
      const review = summary.outcomes.filter((o) => o.status === "conflict" || o.status === "not_found");
      if (review.length) writeFileSync(expandHome(DEFAULT_IMAGES_REVIEW), JSON.stringify(review.map(({ sourceId, status, note }) => ({ sourceId, status, note })), null, 1), { mode: 0o600 });
    }
    if (summary.notLive) return 3;
    return summary.outcomes.some((o) => o.status === "error") ? 1 : 0;
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
    return 2;
  }
}

if ((import.meta as { main?: boolean }).main) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
