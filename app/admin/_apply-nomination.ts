import { count, eq } from "drizzle-orm";
import { admins, adminApprovals, adminNominations, users } from "@/lib/db/schema";
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

  const approvals = await tx
    .select()
    .from(adminApprovals)
    .where(eq(adminApprovals.nominationId, nominationId));
  const distinct = approvals
    .map((a) => a.approverAdminId)
    .filter((id) => id !== nom.nominatedByAdminId);
  if (distinct.length < 2) return { applied: false, reason: "insufficient_approvers" };

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
    const [{ total }] = await tx.select({ total: count() }).from(admins);
    if (total <= 1) return { applied: false, reason: "would_remove_last_admin" };
    await tx.delete(admins).where(eq(admins.id, nom.targetAdminId));
    const [{ total: afterDelete }] = await tx.select({ total: count() }).from(admins);
    if (afterDelete === 0) throw new Error("last_admin_race");
  }

  await tx
    .update(adminNominations)
    .set({ status: "approved" })
    .where(eq(adminNominations.id, nominationId));
  return { applied: true };
}
