import { describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { users } from "@/lib/db/schema";
import { getGuide, getVersions, listGuides, restoreVersion, saveGuide } from "./_guides";

async function setup() {
  const t = await createTestDb();
  await t.db.insert(users).values([
    { id: "u-aisha", email: "aisha@ucsc.edu", name: "Aisha Karim" },
    { id: "u-omar", email: "omar@ucsc.edu" },
  ]);
  return t;
}

describe("playbook guides", () => {
  it("are seeded by migration 0005, one per task, with the funding TODO", async () => {
    const { db, client } = await setup();
    expect((await listGuides(db)).map((g) => g.title)).toEqual([
      "Book a room",
      "Get funding",
      "Run a bigger event",
      "Buy food",
      "Promote the event",
    ]);
    const funding = await getGuide(db, "funding");
    expect(funding?.body).toContain("TODO: college funding emails (to be filled in).");
    expect(funding?.editedBy).toBeNull();
    expect(await getVersions(db, "funding")).toEqual([]);
    client.close();
  });

  it("keeps every saved version, shows who edited last, and restores an old one", async () => {
    const { db, client } = await setup();
    const original = (await getGuide(db, "food"))!;

    expect(await saveGuide(db, "food", { title: "Buy food", body: "Oops, wiped." }, "u-omar")).toEqual({
      ok: true,
      changed: true,
    });
    const edited = (await getGuide(db, "food"))!;
    expect(edited.body).toBe("Oops, wiped.");
    expect(edited.editedBy).toBe("omar");

    const versions = await getVersions(db, "food");
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ body: original.body, editedBy: null });

    expect((await restoreVersion(db, "food", versions[0].id, "u-aisha")).ok).toBe(true);
    const restored = (await getGuide(db, "food"))!;
    expect(restored.body).toBe(original.body);
    expect(restored.editedBy).toBe("Aisha Karim");
    // The bad edit is still there to go back to.
    expect((await getVersions(db, "food")).map((v) => v.body)).toEqual(["Oops, wiped.", original.body]);
    client.close();
  });

  it("saving unchanged text adds no version", async () => {
    const { db, client } = await setup();
    const g = (await getGuide(db, "promotion"))!;
    expect(await saveGuide(db, "promotion", { title: g.title, body: g.body }, "u-omar")).toEqual({
      ok: true,
      changed: false,
    });
    expect(await getVersions(db, "promotion")).toEqual([]);
    client.close();
  });

  it("rejects an empty title, an oversized guide, an unknown guide and another guide's version", async () => {
    const { db, client } = await setup();
    expect((await saveGuide(db, "food", { title: " ", body: "x" }, "u-omar")).ok).toBe(false);
    expect((await saveGuide(db, "food", { title: "Food", body: "x".repeat(20_001) }, "u-omar")).ok).toBe(false);
    expect(await saveGuide(db, "nope", { title: "x", body: "x" }, "u-omar")).toEqual({ ok: false, error: "not_found" });
    await saveGuide(db, "funding", { title: "Get funding", body: "new" }, "u-omar");
    const [fundingV] = await getVersions(db, "funding");
    expect(await restoreVersion(db, "food", fundingV.id, "u-omar")).toEqual({ ok: false, error: "not_found" });
    client.close();
  });
});
