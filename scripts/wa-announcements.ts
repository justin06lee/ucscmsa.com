// The MSA WhatsApp announcements chat → the event import API. The daily
// runbook is docs/msa-sync.md; the API is docs/import.md.
//
//   bun scripts/wa-announcements.ts read --since <ISO|unix> [--until <ISO|unix>] [--no-state]
//   bun scripts/wa-announcements.ts import <batch.json> [--check | --dry-run] [--base-url <url>]
//   bun scripts/wa-announcements.ts chats [--name <chat name>]
//
// WhatsApp's own files are never opened in place: the database and its -wal
// and -shm are copied into a private temp directory, read there read-only,
// and deleted. Only the configured chat's messages are read. The only network
// call is the import request, and the token is never printed.
//
// Settings live outside the repo, in ~/.config/midna/ucscmsa-wa.json (or
// --config <path>): chatJid, plus optional dbDir, tokenFile, stateFile, baseUrl.

import { createHash } from "node:crypto";
import {
  chmodSync,
  constants as fsConstants,
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { formatInTimeZone } from "date-fns-tz";
import { z } from "zod";
import { importRequestSchema } from "@/lib/import/schema";
import { SITE_TZ, startOfLocalDayUtc } from "@/lib/time";

export const DEFAULT_CONFIG_PATH = "~/.config/midna/ucscmsa-wa.json";
export const DEFAULT_DB_DIR = "~/Library/Group Containers/group.net.whatsapp.WhatsApp.shared";
export const DEFAULT_TOKEN_FILE = "~/.config/midna/ucscmsa-import-token";
export const DEFAULT_STATE_FILE = "~/.config/midna/ucscmsa-wa-state.json";
export const DEFAULT_BASE_URL = "https://ucscmsa.com";
export const DB_FILES = ["ChatStorage.sqlite", "ChatStorage.sqlite-wal", "ChatStorage.sqlite-shm"] as const;
export const TEMP_PREFIX = "wa-announcements-";

/** A problem with the command line, config, batch or token: exit code 2. */
export class UsageError extends Error {}

export function expandHome(p: string): string {
  return p === "~" ? homedir() : p.startsWith("~/") ? join(homedir(), p.slice(2)) : p;
}

// ---------------------------------------------------------------------------
// Time. WhatsApp stores Core Data timestamps: seconds since 2001-01-01 UTC.

export const APPLE_EPOCH_UNIX = 978_307_200;

export function appleToDate(seconds: number): Date {
  return new Date(Math.round((seconds + APPLE_EPOCH_UNIX) * 1000));
}

export function dateToApple(d: Date): number {
  return d.getTime() / 1000 - APPLE_EPOCH_UNIX;
}

export type Times = { utc: string; santaCruz: string; unix: number };

/** One instant, in UTC and in Santa Cruz wall-clock time with its offset. */
export function times(d: Date): Times {
  return {
    utc: formatInTimeZone(d, "UTC", "yyyy-MM-dd'T'HH:mm:ss'Z'"),
    santaCruz: formatInTimeZone(d, SITE_TZ, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    unix: Math.floor(d.getTime() / 1000),
  };
}

/**
 * --since / --until: unix seconds, an ISO date-time with Z or an offset, or a
 * bare YYYY-MM-DD meaning Santa Cruz midnight. A date-time without an offset
 * is refused rather than guessed.
 */
export function parseTimeArg(s: string, flag: string): Date {
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (n > 1e11) throw new UsageError(`${flag} ${s} looks like milliseconds; give unix seconds`);
    return new Date(n * 1000);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = startOfLocalDayUtc(s);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d;
  }
  throw new UsageError(
    `${flag} ${s}: give unix seconds, YYYY-MM-DD (Santa Cruz midnight), or an ISO time with Z or an offset`
  );
}

// ---------------------------------------------------------------------------
// Config.

const configSchema = z.object({
  chatJid: z.string().regex(/^\d+(-\d+)?@g\.us$/, "a group JID like 1203...@g.us").optional(),
  chatName: z.string().optional(),
  dbDir: z.string().optional(),
  tokenFile: z.string().optional(),
  stateFile: z.string().optional(),
  baseUrl: z.string().url().optional(),
});

export type Config = {
  chatJid: string | null;
  chatName: string | null;
  dbDir: string;
  tokenFile: string;
  stateFile: string;
  baseUrl: string;
};

export function loadConfig(path: string): Config {
  const file = expandHome(path);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new UsageError(`Can't read the config ${path}: ${(e as Error).message}`);
  }
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    throw new UsageError(
      `Bad config ${path}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
    );
  }
  const c = parsed.data;
  return {
    chatJid: c.chatJid ?? null,
    chatName: c.chatName ?? null,
    dbDir: expandHome(c.dbDir ?? DEFAULT_DB_DIR),
    tokenFile: expandHome(c.tokenFile ?? DEFAULT_TOKEN_FILE),
    stateFile: expandHome(c.stateFile ?? DEFAULT_STATE_FILE),
    baseUrl: c.baseUrl ?? DEFAULT_BASE_URL,
  };
}

// ---------------------------------------------------------------------------
// Opening a private copy of the database.

type SqlValue = string | number | null;
export type Row = Record<string, unknown>;
export interface SqliteDb {
  all(sql: string, ...params: SqlValue[]): Row[];
  close(): void;
}
export type OpenDb = (path: string) => SqliteDb | Promise<SqliteDb>;

/** bun:sqlite, read-only. Loaded lazily so the tests can run this file on Node. */
export const openWithBunSqlite: OpenDb = async (path) => {
  const specifier = "bun:sqlite";
  const { Database } = (await import(specifier)) as {
    Database: new (p: string, o: { readonly: boolean }) => {
      exec(sql: string): void;
      query(sql: string): { all(...p: SqlValue[]): Row[] };
      close(): void;
    };
  };
  const db = new Database(path, { readonly: true });
  db.exec("PRAGMA query_only = ON");
  return { all: (sql, ...params) => db.query(sql).all(...params), close: () => db.close() };
};

function permissionHint(e: unknown, dir: string): never {
  const code = (e as NodeJS.ErrnoException).code;
  if (code === "EPERM" || code === "EACCES") {
    throw new UsageError(
      `macOS blocked reading ${dir} (${code}: Operation not permitted). The app running this command ` +
        `(Terminal, iTerm, or whatever runs midna) needs Full Disk Access, or permission to access data ` +
        `from other apps, in System Settings → Privacy & Security. Grant it there; don't work around it.`
    );
  }
  throw e;
}

function fingerprint(srcDir: string): string {
  return DB_FILES.map((f) => {
    try {
      const s = statSync(join(srcDir, f));
      return `${f}:${s.size}:${s.mtimeMs}`;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return `${f}:-`;
      return permissionHint(e, srcDir);
    }
  }).join("|");
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Copies the database, -wal and -shm into a new 0700 temp directory, opens
 * the copy, runs fn, and deletes the directory. The copy is retried if
 * WhatsApp writes to any of the three files while they're being copied, so
 * the database and its WAL always come from the same moment.
 */
export async function withDbCopy<T>(
  srcDir: string,
  openDb: OpenDb,
  fn: (db: SqliteDb) => T | Promise<T>
): Promise<T> {
  if (fingerprint(srcDir).startsWith(`${DB_FILES[0]}:-`)) {
    throw new UsageError(`No WhatsApp database at ${join(srcDir, DB_FILES[0])}`);
  }
  const dir = mkdtempSync(join(tmpdir(), TEMP_PREFIX));
  try {
    chmodSync(dir, 0o700);
    let copied = false;
    for (let attempt = 1; attempt <= 5 && !copied; attempt++) {
      const before = fingerprint(srcDir);
      for (const f of DB_FILES) {
        rmSync(join(dir, f), { force: true });
        if (before.includes(`${f}:-`)) continue;
        try {
          copyFileSync(join(srcDir, f), join(dir, f), fsConstants.COPYFILE_FICLONE);
        } catch (e) {
          permissionHint(e, srcDir);
        }
        chmodSync(join(dir, f), 0o600);
      }
      copied = fingerprint(srcDir) === before;
      if (!copied) await sleep(250 * attempt);
    }
    if (!copied) throw new Error("WhatsApp kept writing its database while it was being copied; try again in a minute.");
    const db = await openDb(join(dir, DB_FILES[0]));
    try {
      return await fn(db);
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Reading the chat.

// ZWAMESSAGE.ZMESSAGETYPE. 0, 1, 2, 7, 14 and 46 occur in the announcements
// chat; 3, 4, 5, 8, 11 and 15 are WhatsApp's usual values for the rest.
// 6 and 10 are system rows (joins, settings, call notices) and are skipped.
const MESSAGE_TYPES: Record<number, string> = {
  0: "text",
  1: "image",
  2: "video",
  3: "audio",
  4: "contact",
  5: "location",
  7: "link",
  8: "document",
  11: "gif",
  14: "revoked",
  15: "sticker",
  46: "poll",
};
const SYSTEM_TYPES = [6, 10];
const CAPTIONED = new Set(["image", "video", "document", "gif"]);
const WITH_MEDIA = new Set([...CAPTIONED, "audio", "sticker"]);

// ZWAMESSAGE.ZFLAGS bit set on a message an admin deleted for everyone; ZTEXT
// then holds the admin's JID instead of text.
const FLAG_REVOKED_BY_ADMIN = 0x10000000;

export type WaMessage = {
  /** WhatsApp's message (stanza) id. Stable across devices and edits. */
  id: string;
  /** The import API sourceId for an event first announced in this message. */
  sourceId: string;
  time: Times;
  sender: { name: string | null; jid: string | null; admin: boolean; fromMe: boolean };
  type: string;
  /** ZMESSAGETYPE, for types this script doesn't name ("unknown"). */
  waType: number;
  /** The latest text, after any edits. Null for media, polls and revoked messages. */
  text: string | null;
  caption: string | null;
  /** The downloaded media file in WhatsApp's folder, or null if it isn't downloaded. */
  mediaPath: string | null;
  /** A link message's preview title. */
  linkTitle: string | null;
  /** The id of the message this one replies to, under an announcement. */
  replyTo: string | null;
  edited: boolean;
  /** When this script first saw the changed text: WhatsApp keeps no edit time. */
  editSeenAt: string | null;
  revoked: boolean;
  revokedAt: Times | null;
  revokedBy: "sender" | "admin" | null;
};

/** What `read` remembers between runs, to notice edits: a hash per message. */
export type ReadState = {
  version: 1;
  chatJid: string;
  messages: Record<string, { h: string; editSeenAt?: string }>;
};

const MESSAGES_SQL = `
  select m.Z_PK as pk, m.ZSTANZAID as id, m.ZMESSAGETYPE as type, m.ZFLAGS as flags,
         m.ZISFROMME as fromMe, m.ZMESSAGEDATE as date, m.ZSENTDATE as sentDate, m.ZTEXT as text,
         mi.ZTITLE as title, mi.ZMEDIALOCALPATH as localPath,
         gm.ZMEMBERJID as memberJid, gm.ZISADMIN as isAdmin,
         nullif(gm.ZCONTACTNAME, '') as contactName, nullif(gm.ZFIRSTNAME, '') as firstName,
         (select nullif(pn.ZPUSHNAME, '') from ZWAPROFILEPUSHNAME pn
           where pn.ZJID = gm.ZMEMBERJID limit 1) as pushName,
         parent.ZSTANZAID as parentId
    from ZWAMESSAGE m
    left join ZWAMEDIAITEM mi on mi.Z_PK = m.ZMEDIAITEM
    left join ZWAGROUPMEMBER gm on gm.Z_PK = m.ZGROUPMEMBER
    left join ZWAMESSAGE parent on parent.Z_PK = m.ZPARENTMESSAGE and parent.ZCHATSESSION = m.ZCHATSESSION
   where m.ZCHATSESSION = ? and m.ZMESSAGETYPE not in (${SYSTEM_TYPES.join(", ")})
   order by m.ZMESSAGEDATE, m.Z_PK`;

function findChat(db: SqliteDb, chatJid: string): number {
  const rows = db.all("select Z_PK as pk from ZWACHATSESSION where ZCONTACTJID = ?", chatJid);
  if (rows.length !== 1) {
    throw new UsageError(`Expected one chat with JID ${chatJid}, found ${rows.length}. Check chatJid in the config.`);
  }
  return Number(rows[0].pk);
}

const str = (v: unknown) => (typeof v === "string" ? v : null);
const textHash = (text: string | null, caption: string | null) =>
  createHash("sha256").update(JSON.stringify([text, caption])).digest("hex").slice(0, 32);

export type ReadOptions = {
  chatJid: string;
  since: Date;
  until?: Date | null;
  state?: ReadState | null;
  now?: Date;
  /** Where WhatsApp keeps downloaded media: <dbDir>/Message. */
  mediaDir?: string | null;
};

/**
 * The configured chat's messages sent in [since, until), plus older ones
 * revoked, or first seen edited, in that window. Returns the updated state.
 */
export function readMessages(db: SqliteDb, opts: ReadOptions): { messages: WaMessage[]; state: ReadState } {
  const chat = findChat(db, opts.chatJid);
  const now = opts.now ?? new Date();
  const prev = opts.state?.chatJid === opts.chatJid ? opts.state.messages : {};
  const state: ReadState = { version: 1, chatJid: opts.chatJid, messages: { ...prev } };
  const inWindow = (d: Date) => d >= opts.since && (!opts.until || d < opts.until);

  const messages: WaMessage[] = [];
  for (const r of db.all(MESSAGES_SQL, chat)) {
    const id = str(r.id);
    if (!id) continue;
    const waType = Number(r.type);
    const type = MESSAGE_TYPES[waType] ?? "unknown";
    const revoked = type === "revoked";
    const flags = Number(r.flags ?? 0);
    const title = str(r.title);
    const text = revoked ? null : str(r.text);
    const caption = CAPTIONED.has(type) ? title : null;
    // Only the path is given out; the file is checked for, never opened.
    let mediaPath: string | null = null;
    const localPath = str(r.localPath);
    if (WITH_MEDIA.has(type) && opts.mediaDir && localPath) {
      const file = resolve(opts.mediaDir, localPath);
      if (file.startsWith(resolve(opts.mediaDir) + sep) && existsSync(file)) mediaPath = file;
    }
    const sent = appleToDate(Number(r.date));
    const revokedAt = revoked && r.sentDate != null ? appleToDate(Number(r.sentDate)) : null;

    // Edits replace the text in place, under the same id. WhatsApp keeps no
    // edit marker in this database, so compare with the last run's hash.
    let editSeenAt: string | undefined;
    if (revoked) {
      editSeenAt = prev[id]?.editSeenAt;
      state.messages[id] = { h: "revoked", ...(editSeenAt ? { editSeenAt } : {}) };
    } else {
      const h = textHash(text, caption);
      const before = prev[id];
      editSeenAt = before && before.h !== h && before.h !== "revoked" ? now.toISOString() : before?.editSeenAt;
      state.messages[id] = { h, ...(editSeenAt ? { editSeenAt } : {}) };
    }

    if (!inWindow(sent) && !(revokedAt && inWindow(revokedAt)) && !(editSeenAt && inWindow(new Date(editSeenAt)))) {
      continue;
    }
    const fromMe = Number(r.fromMe) === 1;
    messages.push({
      id,
      sourceId: `wa:${id}`,
      time: times(sent),
      sender: {
        name: fromMe ? null : str(r.contactName) ?? str(r.firstName) ?? str(r.pushName),
        jid: fromMe ? null : str(r.memberJid),
        admin: Number(r.isAdmin) === 1,
        fromMe,
      },
      type,
      waType,
      text,
      caption,
      mediaPath,
      linkTitle: type === "link" ? title : null,
      replyTo: str(r.parentId),
      edited: Boolean(editSeenAt),
      editSeenAt: editSeenAt ? times(new Date(editSeenAt)).santaCruz : null,
      revoked,
      revokedAt: revokedAt ? times(revokedAt) : null,
      revokedBy: revoked ? (flags & FLAG_REVOKED_BY_ADMIN ? "admin" : "sender") : null,
    });
  }
  return { messages, state };
}

export function loadState(path: string): ReadState | null {
  if (!existsSync(path)) return null;
  const s = JSON.parse(readFileSync(path, "utf8")) as ReadState;
  return s?.version === 1 && typeof s.messages === "object" ? s : null;
}

export function saveState(path: string, state: ReadState): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
  renameSync(tmp, path);
}

// ---------------------------------------------------------------------------
// Finding the chat: metadata only, never message content.

// ZWACHATSESSION.ZSESSIONTYPE: 1 is a group, 4 a community's parent group.
const SESSION_KINDS: Record<number, string> = { 1: "group", 4: "community" };

export function describeChats(db: SqliteDb, name: string): Row[] {
  const chats = db.all(
    `select s.Z_PK as pk, s.ZCONTACTJID as jid, s.ZPARTNERNAME as name, s.ZSESSIONTYPE as sessionType,
            g.ZCREATIONDATE as created
       from ZWACHATSESSION s left join ZWAGROUPINFO g on g.Z_PK = s.ZGROUPINFO
      where s.ZPARTNERNAME = ? order by s.Z_PK`,
    name
  );
  return chats.map((c) => {
    const [members] = db.all(
      "select count(*) as members, coalesce(sum(ZISADMIN), 0) as admins from ZWAGROUPMEMBER where ZCHATSESSION = ?",
      Number(c.pk)
    );
    const [m] = db.all(
      `select count(*) as messages,
              coalesce(sum(m.ZMESSAGETYPE in (${SYSTEM_TYPES.join(", ")})), 0) as systemMessages,
              count(distinct case when m.ZMESSAGETYPE not in (${SYSTEM_TYPES.join(", ")}) then m.ZGROUPMEMBER end) as posters,
              coalesce(sum(m.ZMESSAGETYPE not in (${SYSTEM_TYPES.join(", ")}) and gm.ZISADMIN = 1), 0) as postsByAdmins,
              coalesce(sum(m.ZPARENTMESSAGE is not null and m.ZMESSAGETYPE not in (${SYSTEM_TYPES.join(", ")})), 0) as replies,
              min(m.ZMESSAGEDATE) as first, max(m.ZMESSAGEDATE) as last
         from ZWAMESSAGE m left join ZWAGROUPMEMBER gm on gm.Z_PK = m.ZGROUPMEMBER
        where m.ZCHATSESSION = ?`,
      Number(c.pk)
    );
    const at = (v: unknown) => (v == null ? null : times(appleToDate(Number(v))).santaCruz);
    return {
      jid: c.jid,
      name: c.name,
      sessionType: c.sessionType,
      kind: SESSION_KINDS[Number(c.sessionType)] ?? "other",
      created: at(c.created),
      members: members.members,
      admins: members.admins,
      ...m,
      first: at(m.first),
      last: at(m.last),
    };
  });
}

// ---------------------------------------------------------------------------
// Sending a batch to the import API.

export type ImportOptions = {
  batchPath: string;
  dryRun: boolean;
  /** Validate only: no token, no network. */
  check?: boolean;
  baseUrl: string;
  tokenFile: string;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  out?: (s: string) => void;
  err?: (s: string) => void;
};

type ImportResult = { index: number; op: string; sourceId: string; status: string; reason?: string; eventId?: string; occurrenceDate?: string };

const MAX_RATE_LIMIT_WAITS = 3;
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = [5_000, 20_000];
const MAX_WAIT_SEC = 3600;

function readToken(path: string): string {
  let mode: number;
  try {
    mode = statSync(path).mode;
  } catch {
    throw new UsageError(`No import token at ${path}`);
  }
  if (mode & 0o077) throw new UsageError(`${path} is readable by other users; run chmod 600 on it first`);
  const token = readFileSync(path, "utf8").trim();
  if (token.length < 32) throw new UsageError(`The token in ${path} is too short to be the import token`);
  return token;
}

export function importUrl(baseUrl: string): URL {
  let url: URL;
  try {
    url = new URL("/api/import/events", baseUrl);
  } catch {
    throw new UsageError(`Bad --base-url ${baseUrl}`);
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new UsageError(`Refusing to send the token to ${url.origin}: use https (http only for localhost)`);
  }
  return url;
}

/** Validates the batch locally, sends it, prints the results. Returns the exit code. */
export async function runImport(o: ImportOptions): Promise<number> {
  const out = o.out ?? ((s) => process.stdout.write(`${s}\n`));
  const err = o.err ?? ((s) => process.stderr.write(`${s}\n`));
  const doFetch = o.fetchImpl ?? fetch;
  const wait = o.sleepImpl ?? sleep;

  let batch: Record<string, unknown>;
  try {
    batch = JSON.parse(readFileSync(o.batchPath, "utf8"));
  } catch (e) {
    throw new UsageError(`Can't read the batch ${o.batchPath}: ${(e as Error).message}`);
  }
  if (batch && typeof batch === "object" && "dryRun" in batch) {
    throw new UsageError('The batch file must not set "dryRun"; pass --dry-run instead');
  }
  const parsed = importRequestSchema.safeParse(batch);
  if (!parsed.success) {
    err(`The batch doesn't match the import schema (nothing was sent):`);
    for (const i of parsed.error.issues) err(`  ${i.path.join(".") || "(body)"}: ${i.message}`);
    return 2;
  }
  const seen = new Set<string>();
  for (const op of parsed.data.operations) {
    // wa:<message id>, optionally :<YYYY-MM-DD> for one occurrence of a
    // multi-day announcement, or ig:<shortcode> for an Instagram-only event.
    if (op.op === "upsert" && !/^(wa:[0-9A-Za-z]+(:\d{4}-\d{2}-\d{2})?|ig:[0-9A-Za-z_-]+)$/.test(op.sourceId)) {
      err(`warning: sourceId ${op.sourceId} doesn't follow wa:<message id> or ig:<shortcode>`);
    }
    const key = `${op.op} ${op.sourceId} ${"occurrenceDate" in op ? op.occurrenceDate ?? "" : ""}`;
    if (seen.has(key)) err(`warning: ${key.trim()} appears twice in this batch`);
    seen.add(key);
  }
  if (o.check) {
    const ops = new Map<string, number>();
    for (const op of parsed.data.operations) ops.set(op.op, (ops.get(op.op) ?? 0) + 1);
    err(`check: the batch is valid (${[...ops].map(([op, n]) => `${n} ${op}`).join(", ")}); nothing was sent`);
    return 0;
  }

  const url = importUrl(o.baseUrl);
  const token = readToken(o.tokenFile);
  const body = JSON.stringify(o.dryRun ? { ...batch, dryRun: true } : batch);
  const label = o.dryRun ? "dry run" : "import";

  let rateLimitWaits = 0;
  let retries = 0;
  for (;;) {
    let res: Response;
    try {
      res = await doFetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      if (retries < MAX_RETRIES) {
        err(`${label}: request failed (${(e as Error).name}); retrying in ${RETRY_BACKOFF_MS[retries] / 1000}s`);
        await wait(RETRY_BACKOFF_MS[retries++]);
        continue;
      }
      err(`${label}: request failed: ${(e as Error).message}`);
      return 1;
    }

    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (res.status === 429 && rateLimitWaits < MAX_RATE_LIMIT_WAITS) {
      const sec = Number(res.headers.get("retry-after") ?? json?.retryAfter ?? 60);
      const waitSec = Math.min(Number.isFinite(sec) && sec > 0 ? Math.ceil(sec) : 60, MAX_WAIT_SEC);
      err(`${label}: rate limited; waiting ${waitSec}s as the server asked`);
      rateLimitWaits++;
      await wait(waitSec * 1000);
      continue;
    }
    if ([500, 502, 504].includes(res.status) && retries < MAX_RETRIES) {
      err(`${label}: server error ${res.status}; retrying in ${RETRY_BACKOFF_MS[retries] / 1000}s (safe: batches are idempotent)`);
      await wait(RETRY_BACKOFF_MS[retries++]);
      continue;
    }
    if (res.status >= 300 && res.status < 400) {
      err(`${label}: redirected to ${res.headers.get("location") ?? "?"}; set --base-url to the final address`);
      return 1;
    }
    if (!res.ok || !json || json.ok !== true || !Array.isArray(json.results)) {
      err(`${label}: HTTP ${res.status}${json?.error ? ` ${json.error}` : ""}${json?.message ? `: ${json.message}` : ""}`);
      for (const i of (json?.issues as { path: string; message: string }[] | undefined) ?? []) {
        err(`  ${i.path}: ${i.message}`);
      }
      if (json) out(JSON.stringify(json, null, 2));
      return 1;
    }
    if (o.dryRun && json.dryRun !== true) {
      out(JSON.stringify(json, null, 2));
      err(`${label}: the server did not confirm a dry run. The batch may have been APPLIED; check the calendar.`);
      return 1;
    }

    out(JSON.stringify(json, null, 2));
    const results = json.results as ImportResult[];
    const counts = new Map<string, number>();
    for (const r of results) {
      counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
      const extra = [r.reason, r.occurrenceDate, r.eventId].filter(Boolean).join(" ");
      err(`  #${r.index} ${r.op} ${r.sourceId}: ${r.status}${extra ? ` (${extra})` : ""}`);
    }
    err(`${label}: ${results.length} operations: ${[...counts].map(([s, n]) => `${n} ${s}`).join(", ")}`);
    const bad = results.filter((r) => r.status === "conflict" || r.status === "not_found");
    if (bad.length) {
      err(`${label}: ${bad.length} not applied (conflict or not_found); see above`);
      return 1;
    }
    return 0;
  }
}

// ---------------------------------------------------------------------------
// CLI.

const USAGE = `usage:
  bun scripts/wa-announcements.ts read --since <ISO|unix|YYYY-MM-DD> [--until <...>] [--no-state] [--config <path>]
  bun scripts/wa-announcements.ts import <batch.json> [--check | --dry-run] [--base-url <url>] [--config <path>]
  bun scripts/wa-announcements.ts chats [--name <chat name>] [--config <path>]
See docs/msa-sync.md.`;

type Args = { command: string | undefined; positional: string[]; flags: Map<string, string | true> };

const VALUE_FLAGS = new Set(["--since", "--until", "--base-url", "--config", "--name"]);
const BOOL_FLAGS = new Set(["--check", "--dry-run", "--no-state", "--help"]);

export function parseArgs(argv: string[]): Args {
  const flags = new Map<string, string | true>();
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (VALUE_FLAGS.has(a)) {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new UsageError(`${a} needs a value`);
      flags.set(a, v);
    } else if (BOOL_FLAGS.has(a)) {
      flags.set(a, true);
    } else if (a.startsWith("--")) {
      throw new UsageError(`Unknown option ${a}`);
    } else {
      positional.push(a);
    }
  }
  return { command: positional.shift(), positional, flags };
}

export async function main(argv: string[], openDb: OpenDb = openWithBunSqlite): Promise<number> {
  const err = (s: string) => process.stderr.write(`${s}\n`);
  try {
    const { command, positional, flags } = parseArgs(argv);
    if (!command || flags.has("--help")) {
      err(USAGE);
      return command ? 0 : 2;
    }
    const value = (f: string) => (typeof flags.get(f) === "string" ? (flags.get(f) as string) : undefined);
    const config = loadConfig(value("--config") ?? process.env.WA_ANNOUNCEMENTS_CONFIG ?? DEFAULT_CONFIG_PATH);

    if (command === "read") {
      const sinceArg = value("--since");
      if (!sinceArg) throw new UsageError("read needs --since");
      if (!config.chatJid) throw new UsageError("Set chatJid in the config (find it with the chats command)");
      const since = parseTimeArg(sinceArg, "--since");
      const until = value("--until") ? parseTimeArg(value("--until")!, "--until") : null;
      if (until && until <= since) throw new UsageError("--until must be after --since");
      const useState = !flags.has("--no-state");
      const chatJid = config.chatJid;
      const { messages, state } = await withDbCopy(config.dbDir, openDb, (db) =>
        readMessages(db, {
          chatJid,
          since,
          until,
          state: useState ? loadState(config.stateFile) : null,
          mediaDir: join(config.dbDir, "Message"),
        })
      );
      if (useState) saveState(config.stateFile, state);
      process.stdout.write(`${JSON.stringify(messages, null, 2)}\n`);
      const byType = new Map<string, number>();
      for (const m of messages) byType.set(m.type, (byType.get(m.type) ?? 0) + 1);
      err(
        `read: ${messages.length} messages from ${times(since).santaCruz} to ${until ? times(until).santaCruz : "now"}` +
          (byType.size ? ` (${[...byType].map(([t, n]) => `${t} ${n}`).join(", ")})` : "")
      );
      return 0;
    }
    if (command === "import") {
      const [batchPath] = positional;
      if (!batchPath) throw new UsageError("import needs a batch file");
      if (flags.has("--check") && flags.has("--dry-run")) throw new UsageError("Use --check or --dry-run, not both");
      return await runImport({
        batchPath,
        check: flags.has("--check"),
        dryRun: flags.has("--dry-run"),
        baseUrl: value("--base-url") ?? config.baseUrl,
        tokenFile: config.tokenFile,
      });
    }
    if (command === "chats") {
      const name = value("--name") ?? config.chatName;
      if (!name) throw new UsageError("chats needs --name (or chatName in the config)");
      const chats = await withDbCopy(config.dbDir, openDb, (db) => describeChats(db, name));
      process.stdout.write(`${JSON.stringify(chats, null, 2)}\n`);
      return 0;
    }
    throw new UsageError(`Unknown command ${command}\n${USAGE}`);
  } catch (e) {
    if (e instanceof UsageError) {
      err(e.message);
      return 2;
    }
    err(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

// Run as a script under bun; importing it (the tests) runs nothing. Setting
// exitCode rather than calling exit() lets stdout drain: exit() cut piped
// output off at 128 KiB.
if ((import.meta as { main?: boolean }).main) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
