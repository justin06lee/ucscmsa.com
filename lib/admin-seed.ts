import { eq, or } from "drizzle-orm";
import { adminRemovals, admins } from "@/lib/db/schema";
import type { DB } from "@/lib/db/client";

/**
 * Grants admin to an ADMIN_SEED_EMAILS address at sign-in, unless an approved
 * nomination has removed that person before. Without that check a demoted
 * seed admin was re-promoted at their next sign-in, undoing the two-approver
 * vote for as long as their email stayed in the env var.
 */
export async function seedAdminIfEligible(
  db: DB,
  userId: string,
  email: string,
  seedEmails: readonly string[]
): Promise<boolean> {
  const normalized = email.toLowerCase();
  if (!seedEmails.includes(normalized)) return false;
  const [removed] = await db
    .select({ id: adminRemovals.id })
    .from(adminRemovals)
    .where(or(eq(adminRemovals.email, normalized), eq(adminRemovals.userId, userId)))
    .limit(1);
  if (removed) return false;
  await db
    .insert(admins)
    .values({ userId, promotedByNominationId: null })
    .onConflictDoNothing();
  return true;
}
