import Link from "next/link";
import { db } from "@/lib/db/client";
import { events } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { formatLocal } from "@/lib/time";
import { requireAdmin } from "@/lib/auth";
import { EventBadges } from "@/components/admin/event-origin";

export default async function AdminEvents() {
  await requireAdmin();
  const rows = await db.select().from(events).orderBy(desc(events.startTime));
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl">Events</h1>
        <Link
          href="/admin/events/new"
          className="inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-sm font-medium text-paper transition-colors hover:bg-burgundy"
        >
          New event
        </Link>
      </div>
      {/* Phones: one card per event; the four-column table needs ~560px. */}
      <ul className="flex flex-col gap-3 sm:hidden">
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              href={`/admin/events/${r.id}/edit`}
              className="flex items-center justify-between gap-3 rounded-xl border border-ink/10 px-4 py-3 transition-colors hover:border-ink/25"
            >
              <span className="flex min-w-0 flex-col">
                <span className="font-medium break-words">{r.title}</span>
                <EventBadges source={r.source} cancelledAt={r.cancelledAt} draft={r.draft} />
                <span className="text-sm text-dim">
                  {formatLocal(r.startTime, "MMM d, yyyy h:mm a")}
                  {r.recurrenceFreq ? ` · ${r.recurrenceFreq}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-sm text-burgundy">Edit</span>
            </Link>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="py-8 text-center text-dim">No events yet. Create one to get started.</li>
        )}
      </ul>
      <table className="hidden w-full text-sm sm:table">
        <thead>
          <tr className="text-left text-dim">
            <th className="py-2">Title</th>
            <th className="py-2">Start</th>
            <th className="py-2">Recurrence</th>
            <th className="py-2"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-ink/10">
              <td className="py-2 pr-3">
                <span className="mr-2">{r.title}</span>
                <EventBadges source={r.source} cancelledAt={r.cancelledAt} draft={r.draft} />
              </td>
              <td className="py-2 pr-3 text-dim">
                {formatLocal(r.startTime, "MMM d, yyyy h:mm a")}
              </td>
              <td className="py-2 pr-3 text-dim">{r.recurrenceFreq ?? "—"}</td>
              <td className="py-1 text-right">
                <Link
                  href={`/admin/events/${r.id}/edit`}
                  aria-label={`Edit ${r.title}`}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-burgundy hover:underline"
                >
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
