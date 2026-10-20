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

      await db.insert(schema.users).values({ id: "u1", email: "a@ucsc.edu" });
      const [admin] = await db.insert(schema.admins).values({ userId: "u1" }).returning();
      await db.insert(schema.events).values({
        id: "ev1",
        title: "Halaqa",
        startTime: new Date("2026-10-21T02:00:00.000Z"),
        endTime: new Date("2026-10-21T03:00:00.000Z"),
        createdByAdminId: admin.id,
      });
      await db.insert(schema.eventRsvps).values({
        eventId: "ev1",
        occurrenceStart: new Date("2026-10-21T02:00:00.000Z"),
        userId: "u1",
        status: "yes",
      });
      await db.insert(schema.eventCancellations).values({ eventId: "ev1", occurrenceDate: "2026-10-28" });

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
