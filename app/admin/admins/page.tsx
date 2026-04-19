import { db } from "@/lib/db/client";
import { admins, users } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { DemoteForm } from "./demote-form";
import { formatLocal } from "@/lib/time";
import { getSession } from "@/lib/auth";

export default async function AdminsList() {
  const session = await getSession();
  const rows = await db
    .select({
      id: admins.id,
      userId: admins.userId,
      email: users.email,
      name: users.name,
      promotedAt: admins.promotedAt,
      promotedByNominationId: admins.promotedByNominationId,
    })
    .from(admins)
    .leftJoin(users, eq(admins.userId, users.id))
    .orderBy(desc(admins.promotedAt));

  return (
    <div>
      <h2 className="text-lg font-medium mb-4">Admins</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-dim">
            <th className="py-2">Email</th>
            <th className="py-2">Name</th>
            <th className="py-2">Promoted</th>
            <th className="py-2">Origin</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-ink/10">
              <td className="py-2">{r.email}</td>
              <td className="py-2">{r.name ?? "—"}</td>
              <td className="py-2 text-dim">
                {formatLocal(r.promotedAt, "MMM d, yyyy")}
              </td>
              <td className="py-2 text-dim">
                {r.promotedByNominationId ? `nomination ${r.promotedByNominationId.slice(0, 8)}` : "bootstrap"}
              </td>
              <td className="py-2 text-right">
                {r.userId !== session?.user?.id && (
                  <DemoteForm targetAdminId={r.id} email={r.email ?? ""} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
