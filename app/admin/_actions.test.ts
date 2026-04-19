import { describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { createTestDb } from "@/test/db";
import { adminApprovals, adminNominations, admins, users } from "@/lib/db/schema";
import { applyIfQuorum } from "./_apply-nomination";

async function seedAdmins(db: Awaited<ReturnType<typeof createTestDb>>["db"], emails: string[]) {
  const ids: number[] = [];
  for (const email of emails) {
    const userId = crypto.randomUUID();
    await db.insert(users).values({ id: userId, email });
    const r = await db
      .insert(admins)
      .values({ userId, promotedByNominationId: null })
      .returning({ id: admins.id });
    ids.push(r[0].id);
  }
  return ids;
}

describe("applyIfQuorum", () => {
  it("does not apply with fewer than 2 distinct approvers", async () => {
    const { db, client } = await createTestDb();
    const [a1, a2, a3] = await seedAdmins(db, ["a@ucsc.edu", "b@ucsc.edu", "c@ucsc.edu"]);
    const nomId = ulid();
    await db.insert(adminNominations).values({
      id: nomId,
      action: "promote",
      nomineeEmail: "new@ucsc.edu",
      nominatedByAdminId: a1,
    });
    await db.insert(adminApprovals).values({ nominationId: nomId, approverAdminId: a2 });
    const r = await db.transaction(async (tx) => applyIfQuorum(tx, nomId));
    expect(r).toEqual({ applied: false, reason: "insufficient_approvers" });
    client.close();
  });

  it("does not apply when one approver is the nominator", async () => {
    const { db, client } = await createTestDb();
    const [a1, a2] = await seedAdmins(db, ["a@ucsc.edu", "b@ucsc.edu"]);
    const nomId = ulid();
    await db.insert(adminNominations).values({
      id: nomId,
      action: "promote",
      nomineeEmail: "new@ucsc.edu",
      nominatedByAdminId: a1,
    });
    await db.insert(adminApprovals).values({ nominationId: nomId, approverAdminId: a2 });
    await db.insert(adminApprovals).values({ nominationId: nomId, approverAdminId: a1 });
    const r = await db.transaction(async (tx) => applyIfQuorum(tx, nomId));
    expect(r.applied).toBe(false);
    client.close();
  });

  it("applies promote when 2 distinct non-nominator approvers exist and user pre-exists", async () => {
    const { db, client } = await createTestDb();
    const [a1, a2, a3] = await seedAdmins(db, ["a@ucsc.edu", "b@ucsc.edu", "c@ucsc.edu"]);
    const nomineeUserId = crypto.randomUUID();
    await db.insert(users).values({ id: nomineeUserId, email: "new@ucsc.edu" });

    const nomId = ulid();
    await db.insert(adminNominations).values({
      id: nomId,
      action: "promote",
      nomineeEmail: "new@ucsc.edu",
      nominatedByAdminId: a1,
    });
    await db.insert(adminApprovals).values({ nominationId: nomId, approverAdminId: a2 });
    await db.insert(adminApprovals).values({ nominationId: nomId, approverAdminId: a3 });

    const r = await db.transaction(async (tx) => applyIfQuorum(tx, nomId));
    expect(r.applied).toBe(true);

    const all = await db.select().from(admins);
    expect(all.some((a) => a.userId === nomineeUserId)).toBe(true);
    client.close();
  });

  it("refuses to demote the last admin", async () => {
    const { db, client } = await createTestDb();
    const [only] = await seedAdmins(db, ["only@ucsc.edu"]);
    const nomId = ulid();
    await db.insert(adminNominations).values({
      id: nomId,
      action: "demote",
      targetAdminId: only,
      nominatedByAdminId: only,
    });
    const r = await db.transaction(async (tx) => applyIfQuorum(tx, nomId));
    expect(r.applied).toBe(false);
    client.close();
  });
});
