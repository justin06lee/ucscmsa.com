import Link from "next/link";
import { db } from "@/lib/db/client";
import { events } from "@/lib/db/schema";
import { toLocalYmd } from "@/lib/time";
import { requireAdmin } from "@/lib/auth";
import { adminEventRows } from "./_event-rows";
import { EventsList, FILTERS, type Filter } from "./events-list";

export default async function AdminEvents({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; show?: string; q?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const now = new Date();
  const rows = adminEventRows(await db.select().from(events), now);
  const filter: Filter = sp.show && sp.show in FILTERS ? (sp.show as Filter) : "all";
  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-3xl">Events</h1>
        <Link
          href="/admin/events/new"
          className="inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-sm font-medium text-paper transition-colors hover:bg-burgundy"
        >
          New event
        </Link>
      </div>
      <EventsList
        rows={rows}
        todayYmd={toLocalYmd(now)}
        initial={{ tab: sp.tab === "past" ? "past" : "upcoming", filter, q: sp.q ?? "" }}
      />
    </div>
  );
}
