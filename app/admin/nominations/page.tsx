import { db } from "@/lib/db/client";
import { admins, adminApprovals, adminNominations, users } from "@/lib/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { NominateForm } from "./nominate-form";
import { ActionsRow } from "./actions-row";
import { getSession } from "@/lib/auth";
import { formatLocal } from "@/lib/time";

export default async function NominationsPage() {
  const session = await getSession();
  const myAdminId = session?.user?.adminId ?? null;

  const noms = await db
    .select({
      id: adminNominations.id,
      action: adminNominations.action,
      nomineeEmail: adminNominations.nomineeEmail,
      targetAdminId: adminNominations.targetAdminId,
      nominatedByAdminId: adminNominations.nominatedByAdminId,
      createdAt: adminNominations.createdAt,
      status: adminNominations.status,
    })
    .from(adminNominations)
    .orderBy(desc(adminNominations.createdAt));

  const approvalRows =
    noms.length > 0
      ? await db
          .select()
          .from(adminApprovals)
          .where(
            inArray(
              adminApprovals.nominationId,
              noms.map((n) => n.id)
            )
          )
      : [];

  const approvalsByNom = new Map<string, number[]>();
  for (const a of approvalRows) {
    const arr = approvalsByNom.get(a.nominationId) ?? [];
    arr.push(a.approverAdminId);
    approvalsByNom.set(a.nominationId, arr);
  }

  const adminEmails = await db
    .select({ id: admins.id, email: users.email })
    .from(admins)
    .leftJoin(users, eq(admins.userId, users.id));
  const emailByAdminId = new Map<number, string>(
    adminEmails.map((r) => [r.id, r.email ?? String(r.id)])
  );

  return (
    <div>
      <section className="mb-10">
        <h2 className="text-lg font-medium mb-2">Nominate a new admin</h2>
        <NominateForm />
      </section>
      <section>
        <h2 className="text-lg font-medium mb-4">Pending nominations</h2>
        <ul className="flex flex-col gap-3">
          {noms
            .filter((n) => n.status === "pending")
            .map((n) => {
              const approvers = approvalsByNom.get(n.id) ?? [];
              const nominatorEmail =
                emailByAdminId.get(n.nominatedByAdminId) ?? "?";
              const target =
                n.action === "promote"
                  ? n.nomineeEmail
                  : n.targetAdminId != null
                    ? emailByAdminId.get(n.targetAdminId)
                    : "?";
              const iApproved = myAdminId != null && approvers.includes(myAdminId);
              const iAmNominator =
                myAdminId != null && n.nominatedByAdminId === myAdminId;
              return (
                <li
                  key={n.id}
                  className="border border-ink/10 rounded p-4 flex items-center justify-between gap-4"
                >
                  <div>
                    <div className="font-medium">
                      {n.action === "promote" ? "Promote" : "Demote"} {target}
                    </div>
                    <div className="text-sm text-dim">
                      by {nominatorEmail} · {formatLocal(n.createdAt, "MMM d, yyyy h:mm a")}
                    </div>
                    <div className="text-sm text-dim mt-1">
                      Approvals: {approvers.length}/2{" "}
                      {approvers
                        .map((id) => emailByAdminId.get(id) ?? id)
                        .join(", ")}
                    </div>
                  </div>
                  <ActionsRow
                    nominationId={n.id}
                    iAmNominator={iAmNominator}
                    iApproved={iApproved}
                  />
                </li>
              );
            })}
          {noms.filter((n) => n.status === "pending").length === 0 && (
            <li className="text-dim">No open nominations.</li>
          )}
        </ul>
        <h2 className="text-lg font-medium mt-10 mb-2">History</h2>
        <ul className="text-sm text-dim flex flex-col gap-1">
          {noms
            .filter((n) => n.status !== "pending")
            .map((n) => (
              <li key={n.id}>
                {formatLocal(n.createdAt, "MMM d")} · {n.status} ·{" "}
                {n.action === "promote" ? n.nomineeEmail : `admin #${n.targetAdminId}`}
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
