// @vitest-environment node
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APPLE_EPOCH_UNIX,
  appleToDate,
  DB_FILES,
  describeChats,
  importUrl,
  parseTimeArg,
  readMessages,
  runImport,
  TEMP_PREFIX,
  times,
  withDbCopy,
  type OpenDb,
  type ReadState,
  type SqliteDb,
} from "./wa-announcements";

// Vitest runs on Node, which has node:sqlite; @types/node 20 doesn't type it yet.
type NodeDb = {
  exec(sql: string): void;
  prepare(sql: string): { run(...params: unknown[]): unknown; all(...params: unknown[]): unknown[] };
  close(): void;
};
const sqliteModule = "node:sqlite";
const { DatabaseSync } = (await import(sqliteModule)) as {
  DatabaseSync: new (path: string, opts?: { readOnly?: boolean }) => NodeDb;
};

// A synthetic WhatsApp ChatStorage.sqlite with only the tables and columns
// the script reads. Every name, JID and message here is made up.

const ANNOUNCEMENTS = "100000000000000001@g.us";
const COMMUNITY = "100000000000000002@g.us";
const OTHER = "100000000000000003@g.us";
const apple = (iso: string) => Date.parse(iso) / 1000 - APPLE_EPOCH_UNIX;

const SCHEMA = `
  create table ZWACHATSESSION (Z_PK integer primary key, ZCONTACTJID varchar, ZPARTNERNAME varchar,
    ZSESSIONTYPE integer, ZGROUPINFO integer);
  create table ZWAGROUPINFO (Z_PK integer primary key, ZCHATSESSION integer, ZCREATIONDATE timestamp);
  create table ZWAGROUPMEMBER (Z_PK integer primary key, ZCHATSESSION integer, ZMEMBERJID varchar,
    ZCONTACTNAME varchar, ZFIRSTNAME varchar, ZISADMIN integer);
  create table ZWAPROFILEPUSHNAME (Z_PK integer primary key, ZJID varchar, ZPUSHNAME varchar);
  create table ZWAMEDIAITEM (Z_PK integer primary key, ZMESSAGE integer, ZTITLE varchar, ZMEDIALOCALPATH varchar);
  create table ZWAMESSAGE (Z_PK integer primary key, ZCHATSESSION integer, ZSTANZAID varchar,
    ZMESSAGETYPE integer, ZFLAGS integer, ZISFROMME integer, ZMESSAGEDATE timestamp, ZSENTDATE timestamp,
    ZTEXT varchar, ZGROUPMEMBER integer, ZMEDIAITEM integer, ZPARENTMESSAGE integer);
`;

type Msg = {
  pk: number;
  chat?: number;
  id: string;
  type?: number;
  at: string;
  text?: string | null;
  title?: string | null;
  localPath?: string;
  member?: number | null;
  parent?: number | null;
  flags?: number;
  sentAt?: string;
  fromMe?: boolean;
};

function insertMessage(db: NodeDb, m: Msg) {
  const hasMedia = m.title !== undefined || m.localPath !== undefined;
  if (hasMedia) {
    db.prepare("insert into ZWAMEDIAITEM (Z_PK, ZMESSAGE, ZTITLE, ZMEDIALOCALPATH) values (?, ?, ?, ?)").run(
      m.pk,
      m.pk,
      m.title ?? null,
      m.localPath ?? null
    );
  }
  db.prepare(
    `insert into ZWAMESSAGE (Z_PK, ZCHATSESSION, ZSTANZAID, ZMESSAGETYPE, ZFLAGS, ZISFROMME, ZMESSAGEDATE,
       ZSENTDATE, ZTEXT, ZGROUPMEMBER, ZMEDIAITEM, ZPARENTMESSAGE) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    m.pk,
    m.chat ?? 1,
    m.id,
    m.type ?? 0,
    m.flags ?? 0x1000000,
    m.fromMe ? 1 : 0,
    apple(m.at),
    m.sentAt ? apple(m.sentAt) : null,
    m.text ?? null,
    m.member === undefined ? 1 : m.member,
    hasMedia ? m.pk : null,
    m.parent ?? null
  );
}

const MESSAGES: Msg[] = [
  { pk: 10, id: "3AF0000000000000A001", at: "2026-10-01T19:00:00Z", text: "Halaqa Thursday 7 PM in the lounge" },
  { pk: 11, id: "3AF0000000000000A002", type: 1, at: "2026-10-05T01:30:00Z", title: "Potluck Friday 6 PM, bring a dish" },
  { pk: 12, id: "3AF0000000000000A003", type: 7, at: "2026-10-06T18:00:00Z", text: "Sign up: https://example.org/form", title: "Sign-up form" },
  { pk: 13, id: "3AF0000000000000A004", at: "2026-10-06T19:00:00Z", text: "see you there", member: 2, parent: 11 },
  { pk: 14, id: "3AF0000000000000A005", type: 14, at: "2026-10-02T20:00:00Z", title: "3AF0000000000000FFFF", sentAt: "2026-10-10T17:00:00Z" },
  { pk: 15, id: "3AF0000000000000A006", type: 14, at: "2026-10-07T20:00:00Z", title: "3AF0000000000000FFFE", sentAt: "2026-10-07T20:05:00Z", flags: 0x11000000, text: "100000000000009@lid", member: 2 },
  { pk: 16, id: "3AF0000000000000A007", type: 6, at: "2026-10-08T00:00:00Z", member: null },
  { pk: 17, id: "3AF0000000000000A008", type: 75, at: "2026-10-08T01:00:00Z", title: null },
  { pk: 18, id: "3AF0000000000000A009", at: "2026-11-01T08:30:00Z", text: "first 1:30 AM" },
  { pk: 19, id: "3AF0000000000000A00A", at: "2026-11-01T09:30:00Z", text: "second 1:30 AM" },
  { pk: 20, id: "3AF0000000000000A00B", at: "2026-10-09T16:00:00Z", text: "from this Mac's owner", fromMe: true, member: null },
  { pk: 30, chat: 2, id: "3AF0000000000000B001", type: 6, at: "2026-10-01T00:00:00Z", member: null },
  { pk: 40, chat: 3, id: "3AF0000000000000C001", at: "2026-10-05T12:00:00Z", text: "OTHER-CHAT-SECRET", member: 3 },
];

/** Builds the fixture in WAL mode and leaves the writer open, so the newest rows exist only in the -wal. */
function buildFixture(dir: string): NodeDb {
  const db = new DatabaseSync(join(dir, DB_FILES[0]));
  db.exec("pragma journal_mode = wal; pragma wal_autocheckpoint = 0;");
  db.exec(SCHEMA);
  db.exec(`
    insert into ZWAGROUPINFO values (1, 1, ${apple("2025-09-01T12:00:00Z")}), (2, 2, ${apple("2025-09-01T12:00:00Z")});
    insert into ZWACHATSESSION values
      (1, '${ANNOUNCEMENTS}', 'Test MSA', 1, 1),
      (2, '${COMMUNITY}', 'Test MSA', 4, 2),
      (3, '${OTHER}', 'Someone Else', 0, null);
    insert into ZWAGROUPMEMBER values
      (1, 1, '100000000000001@lid', '', null, 1),
      (2, 1, '100000000000002@lid', '', null, 0),
      (3, 3, '100000000000003@lid', 'Other Person', null, 0),
      (4, 2, '100000000000001@lid', '', null, 1);
    insert into ZWAPROFILEPUSHNAME values (1, '100000000000001@lid', 'Board Member'), (2, '100000000000002@lid', 'A Student');
  `);
  for (const m of MESSAGES) insertMessage(db, m);
  return db;
}

const nodeOpen: OpenDb = (path) => {
  const db = new DatabaseSync(path, { readOnly: true });
  return {
    all: (sql, ...params) => db.prepare(sql).all(...params) as Record<string, unknown>[],
    close: () => db.close(),
  };
};

let src: string;
let writer: NodeDb;

beforeEach(() => {
  src = mkdtempSync(join(tmpdir(), "wa-fixture-"));
  writer = buildFixture(src);
});

afterEach(() => {
  writer.close();
  rmSync(src, { recursive: true, force: true });
});

const read = (opts: { since: string; until?: string; state?: ReadState | null; now?: Date; chatJid?: string }) =>
  withDbCopy(src, nodeOpen, (db) =>
    readMessages(db, {
      chatJid: opts.chatJid ?? ANNOUNCEMENTS,
      since: new Date(opts.since),
      until: opts.until ? new Date(opts.until) : null,
      state: opts.state,
      now: opts.now,
      mediaDir: join(src, "Message"),
    })
  );

describe("time", () => {
  it("converts Apple-epoch seconds (from 2001-01-01 UTC)", () => {
    expect(appleToDate(0).toISOString()).toBe("2001-01-01T00:00:00.000Z");
    expect(appleToDate(apple("2026-10-20T20:26:08Z")).toISOString()).toBe("2026-10-20T20:26:08.000Z");
  });

  it("gives Santa Cruz times with the offset in force, across both DST changes", () => {
    // Nov 1 2026: 1:30 AM happens twice, first in PDT, then in PST.
    expect(times(new Date("2026-11-01T08:30:00Z")).santaCruz).toBe("2026-11-01T01:30:00-07:00");
    expect(times(new Date("2026-11-01T09:30:00Z")).santaCruz).toBe("2026-11-01T01:30:00-08:00");
    // Mar 8 2026: 1:59:59 PST is followed by 3:00 PDT.
    expect(times(new Date("2026-03-08T09:59:59Z")).santaCruz).toBe("2026-03-08T01:59:59-08:00");
    expect(times(new Date("2026-03-08T10:00:00Z")).santaCruz).toBe("2026-03-08T03:00:00-07:00");
    expect(times(new Date("2026-10-20T20:26:08Z"))).toEqual({
      utc: "2026-10-20T20:26:08Z",
      santaCruz: "2026-10-20T13:26:08-07:00",
      unix: 1792527968,
    });
  });

  it("parses --since as unix seconds, ISO with an offset, or a Santa Cruz date", () => {
    expect(parseTimeArg("1792527968", "--since").toISOString()).toBe("2026-10-20T20:26:08.000Z");
    expect(parseTimeArg("2026-10-20T13:26:08-07:00", "--since").toISOString()).toBe("2026-10-20T20:26:08.000Z");
    expect(parseTimeArg("2026-10-20T20:26Z", "--since").toISOString()).toBe("2026-10-20T20:26:00.000Z");
    expect(parseTimeArg("2026-11-01", "--since").toISOString()).toBe("2026-11-01T07:00:00.000Z");
    expect(parseTimeArg("2026-11-02", "--since").toISOString()).toBe("2026-11-02T08:00:00.000Z");
  });

  it("refuses times it would have to guess", () => {
    expect(() => parseTimeArg("2026-10-20T13:26:08", "--since")).toThrow(/offset/);
    expect(() => parseTimeArg("1792527968000", "--since")).toThrow(/milliseconds/);
    expect(() => parseTimeArg("2026-02-31", "--since")).toThrow();
    expect(() => parseTimeArg("yesterday", "--since")).toThrow();
  });
});

describe("read", () => {
  it("returns messages in [since, until), oldest first, without system rows", async () => {
    const { messages } = await read({ since: "2026-10-05T01:30:00Z", until: "2026-10-08T01:00:00Z" });
    expect(messages.map((m) => m.id)).toEqual([
      "3AF0000000000000A002", // exactly at since: included
      "3AF0000000000000A003",
      "3AF0000000000000A004",
      "3AF0000000000000A006",
      // the system row at 00:00 is skipped; the type-75 row exactly at until is excluded
    ]);
  });

  it("reads rows that exist only in the WAL", async () => {
    const before = await read({ since: "2026-12-01T00:00:00Z" });
    expect(before.messages).toEqual([]);
    insertMessage(writer, { pk: 50, id: "3AF0000000000000D001", at: "2026-12-02T18:00:00Z", text: "new" });
    expect(statSync(join(src, DB_FILES[1])).size).toBeGreaterThan(0);
    const after = await read({ since: "2026-12-01T00:00:00Z" });
    expect(after.messages.map((m) => m.text)).toEqual(["new"]);
  });

  it("shapes a message: stable id, both times, sender, text", async () => {
    const { messages } = await read({ since: "2026-10-01T00:00:00Z", until: "2026-10-02T00:00:00Z" });
    expect(messages).toEqual([
      {
        id: "3AF0000000000000A001",
        sourceId: "wa:3AF0000000000000A001",
        time: { utc: "2026-10-01T19:00:00Z", santaCruz: "2026-10-01T12:00:00-07:00", unix: 1790881200 },
        sender: { name: "Board Member", jid: "100000000000001@lid", admin: true, fromMe: false },
        type: "text",
        waType: 0,
        text: "Halaqa Thursday 7 PM in the lounge",
        caption: null,
        mediaPath: null,
        linkTitle: null,
        replyTo: null,
        edited: false,
        editSeenAt: null,
        revoked: false,
        revokedAt: null,
        revokedBy: null,
      },
    ]);
  });

  it("gives captions for media, link titles for links, and reply parents", async () => {
    const { messages } = await read({ since: "2026-10-05T00:00:00Z", until: "2026-10-07T00:00:00Z" });
    const byId = Object.fromEntries(messages.map((m) => [m.id, m]));
    expect(byId["3AF0000000000000A002"]).toMatchObject({ type: "image", text: null, caption: "Potluck Friday 6 PM, bring a dish" });
    expect(byId["3AF0000000000000A003"]).toMatchObject({ type: "link", text: "Sign up: https://example.org/form", caption: null, linkTitle: "Sign-up form" });
    expect(byId["3AF0000000000000A004"]).toMatchObject({
      replyTo: "3AF0000000000000A002",
      sender: { name: "A Student", admin: false },
    });
  });

  it("gives a media message's downloaded file, and null when there is none", async () => {
    const flyer = "Media/100000000000000001@g.us/a/c/flyer.jpg";
    mkdirSync(join(src, "Message", "Media", "100000000000000001@g.us", "a", "c"), { recursive: true });
    writeFileSync(join(src, "Message", flyer), "jpg");
    writeFileSync(join(src, "outside.jpg"), "jpg");
    const at = (n: number) => `2026-12-02T18:0${n}:00Z`;
    insertMessage(writer, { pk: 60, id: "3AF0000000000000E001", type: 1, at: at(0), title: "Game night!", localPath: flyer });
    insertMessage(writer, { pk: 61, id: "3AF0000000000000E002", type: 1, at: at(1), localPath: "Media/x/0/0/not-downloaded.jpg" });
    insertMessage(writer, { pk: 62, id: "3AF0000000000000E003", at: at(2), text: "a reply", parent: 60, localPath: flyer });
    insertMessage(writer, { pk: 63, id: "3AF0000000000000E004", type: 1, at: at(3), localPath: "../outside.jpg" });
    const { messages } = await read({ since: "2026-12-01T00:00:00Z" });
    expect(messages.map((m) => m.mediaPath)).toEqual([join(src, "Message", flyer), null, null, null]);
  });

  it("marks the Mac owner's own messages without a sender", async () => {
    const { messages } = await read({ since: "2026-10-09T00:00:00Z", until: "2026-10-10T00:00:00Z" });
    expect(messages[0].sender).toEqual({ name: null, jid: null, admin: false, fromMe: true });
  });

  it("flags revoked messages, with no text, and includes them when the revoke is in the window", async () => {
    // Sent Oct 2, revoked Oct 10: a window holding only the revoke still returns it.
    const { messages } = await read({ since: "2026-10-10T00:00:00Z", until: "2026-10-11T00:00:00Z" });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      id: "3AF0000000000000A005",
      time: { santaCruz: "2026-10-02T13:00:00-07:00" },
      type: "revoked",
      text: null,
      caption: null,
      revoked: true,
      revokedAt: { santaCruz: "2026-10-10T10:00:00-07:00" },
      revokedBy: "sender",
    });
    const admin = await read({ since: "2026-10-07T00:00:00Z", until: "2026-10-08T00:00:00Z" });
    expect(admin.messages[0]).toMatchObject({ id: "3AF0000000000000A006", revokedBy: "admin", text: null });
  });

  it("shows unknown types instead of dropping them", async () => {
    const { messages } = await read({ since: "2026-10-08T01:00:00Z", until: "2026-10-08T02:00:00Z" });
    expect(messages).toMatchObject([{ id: "3AF0000000000000A008", type: "unknown", waType: 75, text: null }]);
  });

  it("flags an edit seen since the last run, shows the latest text, and returns it in the next window", async () => {
    const first = await read({ since: "2026-10-01T00:00:00Z", now: new Date("2026-10-20T10:00:00Z") });
    expect(first.messages.find((m) => m.id === "3AF0000000000000A001")?.edited).toBe(false);

    writer.prepare("update ZWAMESSAGE set ZTEXT = ? where Z_PK = 10").run("Halaqa moved to 8 PM");
    // The daily run after the edit: the message is older than --since, but comes back as edited.
    const second = await read({
      since: "2026-10-20T00:00:00Z",
      state: first.state,
      now: new Date("2026-10-21T10:00:00Z"),
    });
    expect(second.messages.map((m) => m.id)).toEqual(["3AF0000000000000A001", "3AF0000000000000A009", "3AF0000000000000A00A"]);
    const edited = second.messages.find((m) => m.id === "3AF0000000000000A001");
    expect(edited).toMatchObject({ edited: true, text: "Halaqa moved to 8 PM", editSeenAt: "2026-10-21T03:00:00-07:00" });

    // Re-running the same window keeps it flagged (the state remembers when it was seen).
    const again = await read({ since: "2026-10-20T00:00:00Z", state: second.state, now: new Date("2026-10-21T11:00:00Z") });
    expect(again.messages.find((m) => m.id === "3AF0000000000000A001")).toMatchObject({
      edited: true,
      editSeenAt: "2026-10-21T03:00:00-07:00",
    });
    // A revoke isn't an edit.
    expect(again.messages.find((m) => m.id === "3AF0000000000000A005")).toBeUndefined();
  });

  it("ignores state saved for another chat", async () => {
    const first = await read({ since: "2026-10-01T00:00:00Z" });
    writer.prepare("update ZWAMESSAGE set ZTEXT = ? where Z_PK = 10").run("changed");
    const { messages } = await read({ since: "2026-10-01T00:00:00Z", state: { ...first.state, chatJid: OTHER } });
    expect(messages.find((m) => m.id === "3AF0000000000000A001")?.edited).toBe(false);
  });
});

describe("only the configured chat", () => {
  it("never returns another chat's messages", async () => {
    const { messages } = await read({ since: "2000-01-01T00:00:00Z" });
    expect(messages.length).toBe(10);
    expect(JSON.stringify(messages)).not.toContain("OTHER-CHAT-SECRET");
    expect(messages.some((m) => m.id.startsWith("3AF0000000000000B") || m.id.startsWith("3AF0000000000000C"))).toBe(false);
  });

  it("binds every message query to that chat", async () => {
    const queries: { sql: string; params: unknown[] }[] = [];
    const spyOpen: OpenDb = (path) => {
      const db = nodeOpen(path) as SqliteDb;
      return { all: (sql, ...params) => (queries.push({ sql, params }), db.all(sql, ...params)), close: () => db.close() };
    };
    await withDbCopy(src, spyOpen, (db) => readMessages(db, { chatJid: ANNOUNCEMENTS, since: new Date(0) }));
    const messageQueries = queries.filter((q) => /from ZWAMESSAGE/.test(q.sql));
    expect(messageQueries.length).toBeGreaterThan(0);
    for (const q of messageQueries) {
      expect(q.sql).toMatch(/where m\.ZCHATSESSION = \?/);
      expect(q.params).toEqual([1]);
    }
  });

  it("fails on a JID that isn't exactly one chat", async () => {
    await expect(read({ since: "2026-10-01T00:00:00Z", chatJid: "999@g.us" })).rejects.toThrow(/found 0/);
  });

  it("describes chats by name from metadata only", async () => {
    const chats = await withDbCopy(src, nodeOpen, (db) => describeChats(db, "Test MSA"));
    expect(chats).toMatchObject([
      { jid: ANNOUNCEMENTS, kind: "group", members: 2, admins: 1, messages: 11, systemMessages: 1, posters: 2, postsByAdmins: 7, replies: 1 },
      { jid: COMMUNITY, kind: "community", members: 1, admins: 1, messages: 1, systemMessages: 1, posters: 0 },
    ]);
    expect(JSON.stringify(chats)).not.toMatch(/Halaqa|Potluck|SECRET/);
  });
});

describe("WhatsApp's own files", () => {
  const digest = () =>
    Object.fromEntries(
      readdirSync(src).map((f) => {
        const p = join(src, f);
        return [f, `${createHash("sha256").update(readFileSync(p)).digest("hex")}:${statSync(p).mtimeMs}`];
      })
    );

  it("are only copied: the reader opens a private temp copy, which is deleted afterwards", async () => {
    const before = digest();
    const opened: string[] = [];
    let tempDir = "";
    await withDbCopy(
      src,
      (path) => {
        opened.push(path);
        tempDir = join(path, "..");
        expect(statSync(tempDir).mode & 0o777).toBe(0o700);
        expect(readdirSync(tempDir).sort()).toEqual([...DB_FILES].sort());
        for (const f of DB_FILES) expect(statSync(join(tempDir, f)).mode & 0o777).toBe(0o600);
        return nodeOpen(path);
      },
      (db) => readMessages(db, { chatJid: ANNOUNCEMENTS, since: new Date(0) })
    );
    expect(opened).toHaveLength(1);
    expect(opened[0].startsWith(src)).toBe(false);
    expect(opened[0]).toContain(TEMP_PREFIX);
    expect(existsSync(tempDir)).toBe(false);
    expect(digest()).toEqual(before);
  });

  it("deletes the copy even when reading fails", async () => {
    let tempDir = "";
    await expect(
      withDbCopy(
        src,
        (path) => ((tempDir = join(path, "..")), nodeOpen(path)),
        () => {
          throw new Error("boom");
        }
      )
    ).rejects.toThrow("boom");
    expect(existsSync(tempDir)).toBe(false);
  });

  it("says plainly when there is no database", async () => {
    await expect(withDbCopy(join(src, "nope"), nodeOpen, () => 0)).rejects.toThrow(/No WhatsApp database/);
  });
});

describe("import", () => {
  const TOKEN = "dGVzdC10b2tlbi1ub3QtcmVhbC0wMTIzNDU2Nzg5YWJjZGVm";
  let dir: string;
  let out: string[];
  let err: string[];

  const batch = {
    source: "whatsapp",
    operations: [
      {
        op: "upsert",
        sourceId: "wa:3AF0000000000000A002",
        sourceRef: "WhatsApp MSA announcements, 2026-10-04 18:30",
        event: { title: "Potluck", location: "The lounge", date: "2026-10-09", startTime: "18:00", endTime: "20:00" },
      },
    ],
  };

  const files = (b: unknown = batch, mode = 0o600) => {
    writeFileSync(join(dir, "batch.json"), JSON.stringify(b));
    writeFileSync(join(dir, "token"), `${TOKEN}\n`);
    chmodSync(join(dir, "token"), mode);
    return { batchPath: join(dir, "batch.json"), tokenFile: join(dir, "token") };
  };

  const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

  const ok = (status: string, dryRun = true) => ({
    ok: true,
    ...(dryRun ? { dryRun: true } : {}),
    results: [{ index: 0, op: "upsert", sourceId: "wa:3AF0000000000000A002", status, eventId: "01TEST", ...(dryRun ? { dryRun: true } : {}) }],
  });

  const run = (fetchImpl: typeof fetch, opts: { dryRun?: boolean; b?: unknown; mode?: number; baseUrl?: string } = {}) =>
    runImport({
      ...files(opts.b, opts.mode),
      dryRun: opts.dryRun ?? true,
      baseUrl: opts.baseUrl ?? "https://ucscmsa.example",
      fetchImpl,
      sleepImpl: async () => {},
      out: (s) => out.push(s),
      err: (s) => err.push(s),
    });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "wa-import-"));
    out = [];
    err = [];
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("dry run: validates, sends dryRun with the bearer token, prints results, exits 0", async () => {
    const fetchImpl = vi.fn(async () => respond(200, ok("created")));
    expect(await run(fetchImpl)).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("https://ucscmsa.example/api/import/events");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" });
    expect(JSON.parse(String(init.body))).toEqual({ ...batch, dryRun: true });
    expect(JSON.parse(out.join("\n"))).toMatchObject({ dryRun: true, results: [{ status: "created" }] });
    expect(err.join("\n")).toMatch(/dry run: 1 operations: 1 created/);
    expect([...out, ...err].join("\n")).not.toContain(TOKEN);
  });

  it("a real run sends no dryRun", async () => {
    const fetchImpl = vi.fn(async () => respond(200, ok("created", false)));
    expect(await run(fetchImpl, { dryRun: false })).toBe(0);
    expect(JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [URL, RequestInit])[1].body))).toEqual(batch);
  });

  it("refuses an invalid batch without sending it", async () => {
    const fetchImpl = vi.fn();
    const bad = { ...batch, operations: [{ ...batch.operations[0], event: { ...batch.operations[0].event, endTime: "17:00" } }] };
    expect(await run(fetchImpl, { b: bad })).toBe(2);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(err.join("\n")).toMatch(/operations\.0\.event\.endTime: End must be after start/);
  });

  it("--check validates without the token or the network", async () => {
    const fetchImpl = vi.fn();
    const code = await runImport({
      batchPath: files().batchPath,
      tokenFile: join(dir, "missing-token"),
      check: true,
      dryRun: false,
      baseUrl: "https://ucscmsa.example",
      fetchImpl,
      out: (s) => out.push(s),
      err: (s) => err.push(s),
    });
    expect(code).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(err.join("\n")).toMatch(/check: the batch is valid \(1 upsert\); nothing was sent/);
  });

  it("refuses a batch that sets dryRun itself", async () => {
    await expect(run(vi.fn(), { b: { ...batch, dryRun: false } })).rejects.toThrow(/--dry-run/);
  });

  it("refuses a token file other users can read, and plain http", async () => {
    await expect(run(vi.fn(), { mode: 0o644 })).rejects.toThrow(/chmod 600/);
    expect(() => importUrl("http://ucscmsa.com")).toThrow(/https/);
    expect(String(importUrl("http://localhost:3000"))).toBe("http://localhost:3000/api/import/events");
  });

  it("exits non-zero on a conflict or not_found", async () => {
    const conflict = { ...ok("conflict"), results: [{ ...ok("conflict").results[0], reason: "edited_by_admin" }] };
    expect(await run(vi.fn(async () => respond(200, conflict)))).toBe(1);
    expect(err.join("\n")).toMatch(/conflict \(edited_by_admin/);
    expect(await run(vi.fn(async () => respond(200, ok("not_found"))))).toBe(1);
  });

  it("exits non-zero on an API error and prints its issues", async () => {
    const body = { ok: false, error: "invalid_request", message: "nope", issues: [{ path: "operations.0", message: "bad" }] };
    expect(await run(vi.fn(async () => respond(400, body)))).toBe(1);
    expect(err.join("\n")).toMatch(/HTTP 400 invalid_request: nope\n {2}operations\.0: bad/);
  });

  it("waits out a 429's Retry-After, then retries", async () => {
    const sleeps: number[] = [];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(respond(429, { ok: false, error: "rate_limited", retryAfter: 7 }, { "Retry-After": "7" }))
      .mockResolvedValueOnce(respond(200, ok("unchanged")));
    const code = await runImport({
      ...files(),
      dryRun: true,
      baseUrl: "https://ucscmsa.example",
      fetchImpl,
      sleepImpl: async (ms) => void sleeps.push(ms),
      out: (s) => out.push(s),
      err: (s) => err.push(s),
    });
    expect(code).toBe(0);
    expect(sleeps).toEqual([7000]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("treats a dry run the server didn't confirm as a failure", async () => {
    expect(await run(vi.fn(async () => respond(200, ok("created", false))))).toBe(1);
    expect(err.join("\n")).toMatch(/did not confirm a dry run/);
  });

  it("retries a 500 (batches are idempotent) and gives up after two retries", async () => {
    const fetchImpl = vi.fn(async () => respond(500, { ok: false, error: "internal_error", message: "x" }));
    expect(await run(fetchImpl)).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
