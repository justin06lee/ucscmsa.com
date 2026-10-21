import { and, count, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { admins, adminApprovals, adminNominations } from "@/lib/db/schema";
import type { DB } from "@/lib/db/client";
import type { NominateInput } from "./_schemas";
import { applyIfQuorum } from "./_apply-nomination";

// Database halves of the nomination server actions, taking the db and the
// acting admin's id so they can be tested against a local database.

export async function createNomination(db: DB, adminId: number, input: NominateInput) {
  const { action, nomineeEmail, targetAdminId } = input;

  if (action === "promote") {
    if (!nomineeEmail) return { ok: false as const, error: "email required" };
  } else {
    if (!targetAdminId) return { ok: false as const, error: "target admin required" };
    if (targetAdminId === adminId) {
      return { ok: false as const, error: "cannot_nominate_self" };
    }
  }

  const id = ulid();
  return await db.transaction(async (tx) => {
    if (action === "demote") {
      const [target] = await tx
        .select({ id: admins.id })
        .from(admins)
        .where(eq(admins.id, targetAdminId!))
        .limit(1);
      if (!target) return { ok: false as const, error: "target_not_found" };
      const [{ total }] = await tx.select({ total: count() }).from(admins);
      if (total <= 1) {
        return { ok: false as const, error: "cannot demote the last admin" };
      }
    }
    await tx.insert(adminNominations).values({
      id,
      action,
      nomineeEmail: action === "promote" ? nomineeEmail! : null,
      targetAdminId: action === "demote" ? targetAdminId! : null,
      nominatedByAdminId: adminId,
    });
    return { ok: true as const, id };
  });
}

// Thrown inside the approval transaction to undo the approval it inserted.
class UndoApproval extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

// Reasons the nomination can never be applied: close it instead of leaving it
// pending forever.
const VOID_REASONS = new Set([
  "nominator_removed",
  "target_not_found",
  "missing_target",
  "missing_email",
]);

const ERROR_FOR_REASON: Record<string, string> = {
  user_not_found: "nominee_must_sign_in_first",
  would_remove_last_admin: "would_remove_last_admin",
};

export async function approveNominationTx(
  db: DB,
  approverId: number,
  nominationId: string
) {
  try {
    return await db.transaction(async (tx) => {
      const [nom] = await tx.select().from(adminNominations)
        .where(eq(adminNominations.id, nominationId)).limit(1);
      if (!nom) return { ok: false as const, error: "not_found" };
      if (nom.status !== "pending") return { ok: false as const, error: "not_pending" };
      if (nom.nominatedByAdminId === approverId) {
        return { ok: false as const, error: "nominator_cannot_approve" };
      }

      const [existing] = await tx.select().from(adminApprovals)
        .where(and(
          eq(adminApprovals.nominationId, nominationId),
          eq(adminApprovals.approverAdminId, approverId),
        ))
        .limit(1);
      if (existing) return { ok: false as const, error: "already_approved" };

      await tx.insert(adminApprovals).values({
        nominationId,
        approverAdminId: approverId,
      });

      const result = await applyIfQuorum(tx, nominationId);
      if (result.applied) return { ok: true as const, applied: true };
      if (result.reason === "insufficient_approvers") {
        return { ok: true as const, applied: false };
      }
      if (VOID_REASONS.has(result.reason)) {
        await tx.update(adminNominations)
          .set({ status: "cancelled" })
          .where(eq(adminNominations.id, nominationId));
        return { ok: false as const, error: "nomination_void" };
      }
      // Quorum is met but the change can't happen yet (the nominee hasn't
      // signed in, or it would remove the last admin). Committing this
      // approval could strand the nomination with nobody left to approve it,
      // so undo it: this admin can approve again once it can go through.
      throw new UndoApproval(result.reason);
    });
  } catch (err) {
    if (err instanceof UndoApproval) {
      return { ok: false as const, error: ERROR_FOR_REASON[err.reason] ?? err.reason };
    }
    if (err instanceof Error && err.message === "last_admin_race") {
      return { ok: false as const, error: "would_remove_last_admin" };
    }
    throw err;
  }
}
