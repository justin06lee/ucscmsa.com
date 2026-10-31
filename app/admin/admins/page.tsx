import { db } from "@/lib/db/client";
import { admins, users } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { DemoteForm } from "./demote-form";
import { formatLocal } from "@/lib/time";
import { requireAdmin } from "@/lib/auth";

export default async function AdminsList() {
  const session = await requireAdmin();
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
      <h1 className="mb-6 text-3xl">Admins</h1>
      {/* Below md: one card per admin; five columns need ~700px. */}
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="paper-card px-4 py-3">
            <div className="font-medium break-all">{r.email}</div>
            <div className="text-sm text-dim">
              {r.name ?? "—"} · since {formatLocal(r.promotedAt, "MMM d, yyyy")} ·{" "}
              {r.promotedByNominationId ? `nomination ${r.promotedByNominationId.slice(0, 8)}` : "bootstrap"}
            </div>
            {r.userId !== session?.user?.id && (
              <div className="mt-1">
                <DemoteForm targetAdminId={r.id} email={r.email ?? ""} />
              </div>
            )}
          </li>
        ))}
      </ul>
      <table className="hidden w-full text-sm md:table">
        <thead>
          <tr className="text-left text-dim">
            <th className="py-2">Email</th>
            <th className="py-2">Name</th>
            <th className="py-2">Promoted</th>
            <th className="py-2">Origin</th>
            <th className="py-2"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-ink/10">
              <td className="py-2 pr-3 break-all">{r.email}</td>
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
