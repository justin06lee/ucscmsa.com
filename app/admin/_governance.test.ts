import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { createTestDb } from "@/test/db";
import {
  adminApprovals,
  adminNominations,
  adminRemovals,
  admins,
  events,
  users,
} from "@/lib/db/schema";
import { seedAdminIfEligible } from "@/lib/admin-seed";
import { approveNominationTx, createNomination } from "./_governance";

type TestDb = Awaited<ReturnType<typeof createTestDb>>["db"];

async function seedAdmins(db: TestDb, emails: string[]) {
  const ids: number[] = [];
  for (const email of emails) {
    const userId = crypto.randomUUID();
    await db.insert(users).values({ id: userId, email });
    const [row] = await db
      .insert(admins)
      .values({ userId, promotedByNominationId: null })
      .returning({ id: admins.id });
    ids.push(row.id);
  }
  return ids;
}

async function nominate(
  db: TestDb,
  by: number,
  input: { action: "promote"; nomineeEmail: string } | { action: "demote"; targetAdminId: number }
) {
  const r = await createNomination(db, by, input);
  if (!r.ok) throw new Error(r.error);
  return r.id;
}

describe("demotion", () => {
  it("removes an admin who has created events, keeping the events", async () => {
    const { db, client } = await createTestDb();
    const [a1, a2, a3, a4] = await seedAdmins(db, [
      "a@ucsc.edu", "b@ucsc.edu", "c@ucsc.edu", "d@ucsc.edu",
    ]);
    await db.insert(events).values({
      id: "ev1",
      title: "Jummah",
      startTime: new Date("2026-10-23T20:30:00.000Z"),
      endTime: new Date("2026-10-23T21:30:00.000Z"),
      createdByAdminId: a4,
    });

    const nomId = await nominate(db, a1, { action: "demote", targetAdminId: a4 });
    expect(await approveNominationTx(db, a2, nomId)).toEqual({ ok: true, applied: false });
    expect(await approveNominationTx(db, a3, nomId)).toEqual({ ok: true, applied: true });

    const remaining = await db.select().from(admins);
    expect(remaining.map((a) => a.id).sort()).toEqual([a1, a2, a3]);
    const [ev] = await db.select().from(events).where(eq(events.id, "ev1"));
    expect(ev.createdByAdminId).toBeNull();
    const removals = await db.select().from(adminRemovals);
    expect(removals).toMatchObject([{ email: "d@ucsc.edu", nominationId: nomId }]);
    client.close();
  });

  it("rejects a demote nomination for an admin id that doesn't exist", async () => {
    const { db, client } = await createTestDb();
    const [a1] = await seedAdmins(db, ["a@ucsc.edu", "b@ucsc.edu"]);
    const r = await createNomination(db, a1, { action: "demote", targetAdminId: 999 });
    expect(r).toEqual({ ok: false, error: "target_not_found" });
    client.close();
  });
});

describe("approvals", () => {
  it("does not let the nominator approve, or anyone approve twice", async () => {
    const { db, client } = await createTestDb();
    const [a1, a2] = await seedAdmins(db, ["a@ucsc.edu", "b@ucsc.edu", "c@ucsc.edu"]);
    const nomId = await nominate(db, a1, { action: "promote", nomineeEmail: "new@ucsc.edu" });
    expect(await approveNominationTx(db, a1, nomId)).toEqual({
      ok: false,
      error: "nominator_cannot_approve",
    });
    expect(await approveNominationTx(db, a2, nomId)).toEqual({ ok: true, applied: false });
    expect(await approveNominationTx(db, a2, nomId)).toEqual({
      ok: false,
      error: "already_approved",
    });
    client.close();
  });

  it("undoes an approval that reaches quorum before the nominee has signed in, so it can be given again", async () => {
    const { db, client } = await createTestDb();
    const [a1, a2, a3] = await seedAdmins(db, ["a@ucsc.edu", "b@ucsc.edu", "c@ucsc.edu"]);
    const nomId = await nominate(db, a1, { action: "promote", nomineeEmail: "new@ucsc.edu" });

    expect(await approveNominationTx(db, a2, nomId)).toEqual({ ok: true, applied: false });
    expect(await approveNominationTx(db, a3, nomId)).toEqual({
      ok: false,
      error: "nominee_must_sign_in_first",
    });
    const approvals = await db.select().from(adminApprovals);
    expect(approvals.map((a) => a.approverAdminId)).toEqual([a2]);

    // Before the fix a3's approval stuck, a1 can't approve their own
    // nomination, and with three admins the nomination was stranded.
    const nomineeId = crypto.randomUUID();
    await db.insert(users).values({ id: nomineeId, email: "new@ucsc.edu" });
    expect(await approveNominationTx(db, a3, nomId)).toEqual({ ok: true, applied: true });
    const promoted = await db.select().from(admins).where(eq(admins.userId, nomineeId));
    expect(promoted).toHaveLength(1);
    client.close();
  });

  it("ignores approvals left behind by admins who were removed", async () => {
    const { db, client } = await createTestDb();
    const [a1, a2, a3] = await seedAdmins(db, ["a@ucsc.edu", "b@ucsc.edu", "c@ucsc.edu"]);
    await db.insert(users).values({ id: crypto.randomUUID(), email: "new@ucsc.edu" });
    const nomId = await nominate(db, a1, { action: "promote", nomineeEmail: "new@ucsc.edu" });

    // A stale approval from admin id 999, as left behind when foreign keys
    // aren't enforced and a removed admin's rows don't cascade.
    await client.execute("PRAGMA foreign_keys=OFF");
    await db.insert(adminApprovals).values({ nominationId: nomId, approverAdminId: 999 });
    await client.execute("PRAGMA foreign_keys=ON");

    expect(await approveNominationTx(db, a2, nomId)).toEqual({ ok: true, applied: false });
    expect(await approveNominationTx(db, a3, nomId)).toEqual({ ok: true, applied: true });
    client.close();
  });

  it("closes a nomination whose nominator is no longer an admin", async () => {
    const { db, client } = await createTestDb();
    const [, a2] = await seedAdmins(db, ["a@ucsc.edu", "b@ucsc.edu", "c@ucsc.edu"]);
    const nomId = ulid();
    await client.execute("PRAGMA foreign_keys=OFF");
    await db.insert(adminNominations).values({
      id: nomId,
      action: "promote",
      nomineeEmail: "new@ucsc.edu",
      nominatedByAdminId: 999,
    });
    await client.execute("PRAGMA foreign_keys=ON");
    await db.insert(adminApprovals).values({ nominationId: nomId, approverAdminId: a2 });

    const [, , a3] = (await db.select().from(admins)).map((a) => a.id);
    expect(await approveNominationTx(db, a3, nomId)).toEqual({
      ok: false,
      error: "nomination_void",
    });
    const [nom] = await db.select().from(adminNominations).where(eq(adminNominations.id, nomId));
    expect(nom.status).toBe("cancelled");
    client.close();
  });

  it("applies a nomination once: approvals after it is applied are refused", async () => {
    // Approval transactions are libsql "write" (BEGIN IMMEDIATE) transactions,
    // so concurrent approvals serialize and the later one sees the status the
    // earlier one committed.
    const { db, client } = await createTestDb();
    const [a1, a2, a3, a4] = await seedAdmins(db, [
      "a@ucsc.edu", "b@ucsc.edu", "c@ucsc.edu", "d@ucsc.edu",
    ]);
    const nomineeId = crypto.randomUUID();
    await db.insert(users).values({ id: nomineeId, email: "new@ucsc.edu" });
    const nomId = await nominate(db, a1, { action: "promote", nomineeEmail: "new@ucsc.edu" });

    await approveNominationTx(db, a2, nomId);
    expect(await approveNominationTx(db, a3, nomId)).toEqual({ ok: true, applied: true });
    expect(await approveNominationTx(db, a4, nomId)).toEqual({ ok: false, error: "not_pending" });
    expect(await db.select().from(admins).where(eq(admins.userId, nomineeId))).toHaveLength(1);
    client.close();
  });
});

describe("seedAdminIfEligible", () => {
  const seeds = ["a@ucsc.edu", "b@ucsc.edu", "c@ucsc.edu", "d@ucsc.edu"];

  it("seeds a listed email and ignores others", async () => {
    const { db, client } = await createTestDb();
    await db.insert(users).values([
      { id: "u-a", email: "a@ucsc.edu" },
      { id: "u-x", email: "x@ucsc.edu" },
    ]);
    expect(await seedAdminIfEligible(db, "u-a", "A@ucsc.edu", seeds)).toBe(true);
    expect(await seedAdminIfEligible(db, "u-x", "x@ucsc.edu", seeds)).toBe(false);
    expect((await db.select().from(admins)).map((a) => a.userId)).toEqual(["u-a"]);
    client.close();
  });

  it("does not re-promote a seed admin who was removed by nomination", async () => {
    const { db, client } = await createTestDb();
    for (const email of seeds) {
      const id = `u-${email[0]}`;
      await db.insert(users).values({ id, email });
      await seedAdminIfEligible(db, id, email, seeds);
    }
    const byUser = new Map((await db.select().from(admins)).map((a) => [a.userId, a.id]));
    const nomId = await nominate(db, byUser.get("u-a")!, {
      action: "demote",
      targetAdminId: byUser.get("u-d")!,
    });
    await approveNominationTx(db, byUser.get("u-b")!, nomId);
    expect(await approveNominationTx(db, byUser.get("u-c")!, nomId)).toEqual({
      ok: true,
      applied: true,
    });

    // Their next sign-in.
    expect(await seedAdminIfEligible(db, "u-d", "d@ucsc.edu", seeds)).toBe(false);
    expect(await db.select().from(admins).where(eq(admins.userId, "u-d"))).toHaveLength(0);
    client.close();
  });
});
