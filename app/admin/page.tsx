import Link from "next/link";
import { db } from "@/lib/db/client";
import { events } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { formatLocal } from "@/lib/time";

export default async function AdminEvents() {
  const rows = await db.select().from(events).orderBy(desc(events.startTime));
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium">Events</h2>
        <Link
          href="/admin/events/new"
          className="px-4 py-2 rounded-full bg-ink text-paper hover:bg-burgundy"
        >
          New event
        </Link>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-dim">
            <th className="py-2">Title</th>
            <th className="py-2">Start</th>
            <th className="py-2">Recurrence</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-ink/10">
              <td className="py-2">{r.title}</td>
              <td className="py-2 text-dim">
                {formatLocal(r.startTime, "MMM d, yyyy h:mm a")}
              </td>
              <td className="py-2 text-dim">{r.recurrenceFreq ?? "—"}</td>
              <td className="py-2 text-right">
                <Link href={`/admin/events/${r.id}/edit`} className="text-burgundy hover:underline">
                  Edit
                </Link>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="py-8 text-center text-dim">
                No events yet. Create one to get started.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
