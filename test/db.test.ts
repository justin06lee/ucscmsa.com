import { describe, expect, it } from "vitest";
import { createTestDb } from "./db";
import { events } from "@/lib/db/schema";

describe("in-memory test db", () => {
  it("runs migrations and allows inserts", async () => {
    const { db, client } = await createTestDb();
    const count = await db.select().from(events);
    expect(count).toEqual([]);
    client.close();
  });
});
