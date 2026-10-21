import { count, eq } from "drizzle-orm";
import {
  admins,
  adminApprovals,
  adminNominations,
  adminRemovals,
  users,
} from "@/lib/db/schema";
import type { DB } from "@/lib/db/client";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

export async function applyIfQuorum(
  tx: Tx,
  nominationId: string
): Promise<
  | { applied: false; reason: string }
  | { applied: true }
> {
  const [nom] = await tx
    .select()
    .from(adminNominations)
    .where(eq(adminNominations.id, nominationId))
    .limit(1);
  if (!nom) return { applied: false, reason: "not_found" };
  if (nom.status !== "pending") return { applied: false, reason: "not_pending" };

  // A nomination filed by someone who is no longer an admin is void. With
  // foreign keys enforced it is cascade-deleted along with them; this keeps
  // the rule when they are not.
  const [nominator] = await tx
    .select({ id: admins.id })
    .from(admins)
    .where(eq(admins.id, nom.nominatedByAdminId))
    .limit(1);
  if (!nominator) return { applied: false, reason: "nominator_removed" };

  // Only approvals from current admins count, never the nominator's.
  const approvals = await tx
    .select({ approverAdminId: adminApprovals.approverAdminId })
    .from(adminApprovals)
    .innerJoin(admins, eq(admins.id, adminApprovals.approverAdminId))
    .where(eq(adminApprovals.nominationId, nominationId));
  const distinct = new Set(
    approvals
      .map((a) => a.approverAdminId)
      .filter((id) => id !== nom.nominatedByAdminId)
  );
  if (distinct.size < 2) return { applied: false, reason: "insufficient_approvers" };

  if (nom.action === "promote") {
    if (!nom.nomineeEmail) return { applied: false, reason: "missing_email" };
    const [u] = await tx
      .select()
      .from(users)
      .where(eq(users.email, nom.nomineeEmail))
      .limit(1);
    if (!u) return { applied: false, reason: "user_not_found" };
    await tx
      .insert(admins)
      .values({ userId: u.id, promotedByNominationId: nominationId })
      .onConflictDoNothing();
  } else {
    if (!nom.targetAdminId) return { applied: false, reason: "missing_target" };
    const [target] = await tx
      .select({ id: admins.id, userId: admins.userId, email: users.email })
      .from(admins)
      .innerJoin(users, eq(users.id, admins.userId))
      .where(eq(admins.id, nom.targetAdminId))
      .limit(1);
    if (!target) return { applied: false, reason: "target_not_found" };
    const [{ total }] = await tx.select({ total: count() }).from(admins);
    if (total <= 1) return { applied: false, reason: "would_remove_last_admin" };
    // Recorded so ADMIN_SEED_EMAILS seeding can't quietly undo the removal.
    await tx.insert(adminRemovals).values({
      userId: target.userId,
      email: target.email,
      nominationId,
    });
    await tx.delete(admins).where(eq(admins.id, target.id));
    const [{ total: afterDelete }] = await tx.select({ total: count() }).from(admins);
    if (afterDelete === 0) throw new Error("last_admin_race");
  }

  await tx
    .update(adminNominations)
    .set({ status: "approved" })
    .where(eq(adminNominations.id, nominationId));
  return { applied: true };
}
