import { describe, expect, it } from "vitest";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as schema from "@/lib/db/schema";

// Builds a migrations folder holding only the first `n` migrations, so a test
// can stand up the schema as production has it before a new migration.
function migrationsUpTo(n: number): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ucscmsa-migrations-"));
  const journal = JSON.parse(fs.readFileSync("drizzle/meta/_journal.json", "utf8"));
  journal.entries = journal.entries.slice(0, n);
  fs.mkdirSync(path.join(dir, "meta"));
  fs.writeFileSync(path.join(dir, "meta/_journal.json"), JSON.stringify(journal));
  for (const e of journal.entries) {
    fs.copyFileSync(`drizzle/${e.tag}.sql`, path.join(dir, `${e.tag}.sql`));
  }
  return dir;
}

describe("migration 0002 (events.created_by_admin_id nullable, admin_removals)", () => {
  it("keeps every event, RSVP and cancellation when it rebuilds the events table", async () => {
    const file = path.join(os.tmpdir(), `ucscmsa-migtest-${crypto.randomUUID()}.db`);
    const client = createClient({ url: `file:${file}` });
    const db = drizzle(client, { schema });
    try {
      await migrate(db, { migrationsFolder: migrationsUpTo(2) });

      // Raw SQL: the schema object describes the latest tables, not 0001's.
      await client.execute("INSERT INTO user (id, email) VALUES ('u1', 'a@ucsc.edu')");
      await client.execute("INSERT INTO admins (user_id) VALUES ('u1')");
      const admin = { id: 1 };
      await client.execute(
        "INSERT INTO events (id, title, start_time, end_time, created_by_admin_id) VALUES ('ev1', 'Halaqa', 1792548000000, 1792551600000, 1)"
      );
      await client.execute(
        "INSERT INTO event_rsvps (event_id, occurrence_start, user_id, status) VALUES ('ev1', 1792548000000, 'u1', 'yes')"
      );
      await client.execute(
        "INSERT INTO event_cancellations (event_id, occurrence_date) VALUES ('ev1', '2026-10-28')"
      );

      await migrate(db, { migrationsFolder: "./drizzle" });

      expect(await db.select().from(schema.events)).toHaveLength(1);
      expect(await db.select().from(schema.eventRsvps)).toHaveLength(1);
      expect(await db.select().from(schema.eventCancellations)).toHaveLength(1);
      expect((await client.execute("PRAGMA foreign_keys")).rows[0][0]).toBe(1);

      // Deleting the creating admin now nulls the reference instead of failing.
      await db.delete(schema.admins).where(eq(schema.admins.id, admin.id));
      const [ev] = await db.select().from(schema.events);
      expect(ev.createdByAdminId).toBeNull();
      expect(await db.select().from(schema.eventRsvps)).toHaveLength(1);
    } finally {
      client.close();
      fs.rmSync(file, { force: true });
    }
  });
});

describe("migration 0003 (event import columns, tombstones, rate limits)", () => {
  it("keeps existing events as manual ones and enforces one event per source id", async () => {
    const file = path.join(os.tmpdir(), `ucscmsa-migtest-${crypto.randomUUID()}.db`);
    const client = createClient({ url: `file:${file}` });
    const db = drizzle(client);
    try {
      await migrate(db, { migrationsFolder: migrationsUpTo(3) });
      // Raw SQL: the current schema object already has the new columns.
      await client.execute("INSERT INTO user (id, email) VALUES ('u1', 'a@ucsc.edu')");
      await client.execute("INSERT INTO admins (user_id) VALUES ('u1')");
      await client.execute(
        "INSERT INTO events (id, title, start_time, end_time, created_by_admin_id) VALUES ('ev1', 'Halaqa', 1792000000000, 1792003600000, 1)"
      );
      await client.execute(
        "INSERT INTO event_rsvps (event_id, occurrence_start, user_id, status) VALUES ('ev1', 1792000000000, 'u1', 'yes')"
      );

      await migrate(db, { migrationsFolder: "./drizzle" });

      const typed = drizzle(client, { schema });
      const [ev] = await typed.select().from(schema.events);
      expect(ev).toMatchObject({
        id: "ev1",
        title: "Halaqa",
        source: "manual",
        sourceId: null,
        importedAt: null,
        adminEditedAt: null,
        cancelledAt: null,
      });
      expect(await typed.select().from(schema.eventRsvps)).toHaveLength(1);
      expect(await typed.select().from(schema.eventImportTombstones)).toEqual([]);
      expect(await typed.select().from(schema.rateLimits)).toEqual([]);

      const imported = (id: string) => ({
        id,
        title: "Friday Halaqa",
        startTime: new Date("2026-10-23T20:30:00.000Z"),
        endTime: new Date("2026-10-23T21:30:00.000Z"),
        source: "whatsapp",
        sourceId: "msg-1",
      });
      await typed.insert(schema.events).values(imported("ev2"));
      await expect(typed.insert(schema.events).values(imported("ev3"))).rejects.toThrow();
      // Manual events (no source id) don't collide with each other.
      await typed.insert(schema.events).values({ ...imported("ev4"), source: "manual", sourceId: null });
      await typed.insert(schema.events).values({ ...imported("ev5"), source: "manual", sourceId: null });
    } finally {
      client.close();
      fs.rmSync(file, { force: true });
    }
  });
});

describe("migration 0004 (event timing)", () => {
  it("marks existing events timed and keeps their RSVPs and cancellations", async () => {
    const file = path.join(os.tmpdir(), `ucscmsa-migtest-${crypto.randomUUID()}.db`);
    const client = createClient({ url: `file:${file}` });
    const db = drizzle(client);
    try {
      await migrate(db, { migrationsFolder: migrationsUpTo(4) });
      await client.execute("INSERT INTO user (id, email) VALUES ('u1', 'a@ucsc.edu')");
      await client.execute("INSERT INTO admins (user_id) VALUES ('u1')");
      await client.execute(
        "INSERT INTO events (id, title, start_time, end_time, recurrence_freq, created_by_admin_id, source, source_id) VALUES ('ev1', 'Friday Halaqa', 1792000000000, 1792003600000, 'weekly', 1, 'whatsapp', 'msg-1')"
      );
      await client.execute(
        "INSERT INTO event_rsvps (event_id, occurrence_start, user_id, status) VALUES ('ev1', 1792000000000, 'u1', 'yes')"
      );
      await client.execute("INSERT INTO event_cancellations (event_id, occurrence_date) VALUES ('ev1', '2026-10-30')");

      await migrate(db, { migrationsFolder: "./drizzle" });

      const typed = drizzle(client, { schema });
      const [ev] = await typed.select().from(schema.events);
      expect(ev).toMatchObject({
        id: "ev1",
        timing: "timed",
        startTime: new Date(1792000000000),
        endTime: new Date(1792003600000),
        source: "whatsapp",
        sourceId: "msg-1",
      });
      expect(await typed.select().from(schema.eventRsvps)).toHaveLength(1);
      expect(await typed.select().from(schema.eventCancellations)).toHaveLength(1);

      await typed.insert(schema.events).values({
        id: "ev2",
        title: "Potluck",
        timing: "date_only",
        startTime: new Date("2026-10-23T07:00:00.000Z"),
        endTime: new Date("2026-10-24T06:59:59.999Z"),
      });
      const [potluck] = await typed.select().from(schema.events).where(eq(schema.events.id, "ev2"));
      expect(potluck.timing).toBe("date_only");
    } finally {
      client.close();
      fs.rmSync(file, { force: true });
    }
  });
});

describe("migrations 0005 and 0006 (links, images)", () => {
  it("add empty links and images to existing events, which then round-trip as JSON", async () => {
    const file = path.join(os.tmpdir(), `ucscmsa-migtest-${crypto.randomUUID()}.db`);
    const client = createClient({ url: `file:${file}` });
    const db = drizzle(client);
    try {
      await migrate(db, { migrationsFolder: migrationsUpTo(5) });
      await client.execute("INSERT INTO user (id, email) VALUES ('u1', 'a@ucsc.edu')");
      await client.execute(
        "INSERT INTO events (id, title, start_time, end_time, timing) VALUES ('ev1', 'Halaqa', 1792000000000, 1792003600000, 'start_only')"
      );
      await client.execute(
        "INSERT INTO event_rsvps (event_id, occurrence_start, user_id, status) VALUES ('ev1', 1792000000000, 'u1', 'yes')"
      );

      await migrate(db, { migrationsFolder: "./drizzle" });

      const typed = drizzle(client, { schema });
      const [ev] = await typed.select().from(schema.events);
      expect(ev).toMatchObject({ id: "ev1", timing: "start_only", links: null, images: null });
      expect(await typed.select().from(schema.eventRsvps)).toHaveLength(1);

      const links = [{ kind: "rsvp" as const, label: "RSVP", url: "https://forms.gle/x" }];
      const file1 = { url: "https://s.public.blob.vercel-storage.com/flyers/ev1/0123456789abcdef-card.webp", w: 480, h: 600 };
      const images = [{ id: "0123456789abcdef", w: 1080, h: 1350, origin: "import" as const, card: file1, page: file1, full: file1 }];
      await typed.update(schema.events).set({ links, images }).where(eq(schema.events.id, "ev1"));
      const [after] = await typed.select().from(schema.events);
      expect(after.links).toEqual(links);
      expect(after.images).toEqual(images);
    } finally {
      client.close();
      fs.rmSync(file, { force: true });
    }
  });
});

describe("migration 0007 (board: drafts, tags, tasks, guides)", () => {
  it("keeps existing events public with their RSVPs and cancellations, and seeds the guides and lead times", async () => {
    const file = path.join(os.tmpdir(), `ucscmsa-migtest-${crypto.randomUUID()}.db`);
    const client = createClient({ url: `file:${file}` });
    const db = drizzle(client);
    try {
      await migrate(db, { migrationsFolder: migrationsUpTo(7) });
      await client.execute("INSERT INTO user (id, email) VALUES ('u1', 'a@ucsc.edu')");
      await client.execute("INSERT INTO admins (user_id) VALUES ('u1')");
      await client.execute(
        "INSERT INTO events (id, title, start_time, end_time, recurrence_freq, created_by_admin_id, source, source_id) VALUES ('ev1', 'Friday Halaqa', 1792000000000, 1792003600000, 'weekly', 1, 'whatsapp', 'msg-1')"
      );
      await client.execute(
        "INSERT INTO events (id, title, start_time, end_time, created_by_admin_id) VALUES ('ev2', 'Halaqa', 1792100000000, 1792103600000, 1)"
      );
      await client.execute(
        "INSERT INTO event_rsvps (event_id, occurrence_start, user_id, status) VALUES ('ev1', 1792000000000, 'u1', 'yes')"
      );
      await client.execute("INSERT INTO event_cancellations (event_id, occurrence_date) VALUES ('ev1', '2026-10-30')");

      await migrate(db, { migrationsFolder: "./drizzle" });

      const typed = drizzle(client, { schema });
      const evs = await typed.select().from(schema.events);
      expect(evs).toHaveLength(2);
      expect(evs.every((e) => e.draft === false)).toBe(true);
      expect(await typed.select().from(schema.eventRsvps)).toHaveLength(1);
      expect(await typed.select().from(schema.eventCancellations)).toHaveLength(1);
      // Nothing is planned until an admin tags an event.
      expect(await typed.select().from(schema.eventTags)).toEqual([]);
      expect(await typed.select().from(schema.eventTasks)).toEqual([]);

      const guides = await typed.select().from(schema.guides);
      expect(guides.map((g) => g.slug).sort()).toEqual(["bigger-events", "book-a-room", "food", "funding", "promotion"]);
      // Each seeded guide starts with one version to restore to.
      expect(await typed.select().from(schema.guideVersions)).toHaveLength(5);
      const templates = await typed.select().from(schema.taskTemplates);
      expect(Object.fromEntries(templates.map((t) => [t.id, [t.tag, t.daysBefore]]))).toEqual({
        funding: ["funding", 21],
        proposal: ["big", 21],
        advisor: ["big", 14],
        collab: ["collab", 21],
        room: ["room", 14],
        offcampus: ["offcampus", 14],
        purchase: ["food", 7],
        "promo-week": [null, 7],
        "promo-eve": [null, 1],
      });
      // Every template's guide exists.
      const slugs = new Set(guides.map((g) => g.slug));
      expect(templates.filter((t) => t.guideSlug && !slugs.has(t.guideSlug))).toEqual([]);
    } finally {
      client.close();
      fs.rmSync(file, { force: true });
    }
  });
});

describe("drizzle journal", () => {
  // drizzle's migrator skips a migration stamped earlier than the last one
  // applied, so after a branch merge every `when` must still increase.
  it("lists migrations in order, each stamped later than the one before", () => {
    const { entries } = JSON.parse(fs.readFileSync("drizzle/meta/_journal.json", "utf8"));
    entries.forEach((e: { idx: number; when: number; tag: string }, i: number) => {
      expect(e.idx).toBe(i);
      expect(e.tag.startsWith(String(i).padStart(4, "0"))).toBe(true);
      expect(fs.existsSync(`drizzle/${e.tag}.sql`)).toBe(true);
      if (i > 0) expect(e.when).toBeGreaterThan(entries[i - 1].when);
    });
  });
});
