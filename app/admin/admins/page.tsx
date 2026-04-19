import { db } from "@/lib/db/client";
import { admins, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { DemoteForm } from "./demote-form";
import { formatLocal } from "@/lib/time";

export default async function AdminsList() {
  const rows = await db
    .select({
      id: admins.id,
      email: users.email,
      name: users.name,
      promotedAt: admins.promotedAt,
      promotedByNominationId: admins.promotedByNominationId,
    })
    .from(admins)
    .leftJoin(users, eq(admins.userId, users.id));

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
                <DemoteForm targetAdminId={r.id} email={r.email ?? ""} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
