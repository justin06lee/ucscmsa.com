import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { events } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { EventForm } from "@/app/admin/events/event-form";
import { FlyerEditor } from "@/app/admin/events/flyer-editor";
import { deleteEvent, updateEvent } from "@/app/admin/_actions";
import { formatLocal } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { EventBadges, SourceRef, importLabel, sourceName } from "@/components/admin/event-origin";
import Link from "next/link";
import { getEventTags, hasPlan } from "@/app/admin/plan/_plan";

type Props = { params: Promise<{ id: string }> };

export default async function EditEventPage({ params }: Props) {
  await requireAdmin();
  const { id } = await params;
  const row = (await db.select().from(events).where(eq(events.id, id)).limit(1))[0];
  if (!row) notFound();
  const [tags, planned] = await Promise.all([getEventTags(db, id), hasPlan(db, id)]);

  async function submit(fd: FormData) {
    "use server";
    return await updateEvent(id, fd);
  }
  async function del() {
    "use server";
    await deleteEvent(id);
    redirect("/admin");
  }

  return (
    <div>
      <h1 className="mb-6 text-3xl">Edit event</h1>
      {planned ? (
        <p className="-mt-3 mb-5">
          <Link
            href={`/admin/plan/${id}`}
            className="inline-flex min-h-11 items-center text-sm text-burgundy underline decoration-burgundy/30 underline-offset-4 hover:decoration-burgundy"
          >
            Planning checklist
          </Link>
        </p>
      ) : null}
      {(importLabel(row.source) || row.cancelledAt) && (
        <section aria-label="Event origin" className="mb-6 grid max-w-xl gap-1.5 rounded-md border border-ink/15 px-4 py-3 text-sm">
          <EventBadges source={row.source} cancelledAt={row.cancelledAt} />
          {row.sourceRef ? (
            <p className="text-dim">
              From: <SourceRef value={row.sourceRef} />
            </p>
          ) : null}
          {importLabel(row.source) ? (
            row.adminEditedAt ? (
              <p>
                Edited here on {formatLocal(row.adminEditedAt, "MMM d, yyyy")}, so the{" "}
                {sourceName(row.source)} import no longer overwrites this event.
              </p>
            ) : (
              <p>Saving your changes stops the {sourceName(row.source)} import from overwriting this event.</p>
            )
          ) : null}
          {row.cancelledAt ? (
            <p className="text-burgundy">
              Cancelled by the import on {formatLocal(row.cancelledAt, "MMMM d, yyyy 'at' h:mm a")}.
            </p>
          ) : null}
        </section>
      )}
      <EventForm
        submitLabel="Save"
        onSubmit={submit}
        initial={{
          id: row.id,
          title: row.title,
          description: row.description,
          location: row.location,
          startDate: formatLocal(row.startTime, "yyyy-MM-dd"),
          // Unknown times stay blank, not the stored 00:00 / 23:59 stand-ins.
          startTime: row.timing === "date_only" ? "" : formatLocal(row.startTime, "HH:mm"),
          endDate: formatLocal(row.endTime, "yyyy-MM-dd"),
          endTime: row.timing === "timed" ? formatLocal(row.endTime, "HH:mm") : "",
          recurrenceFreq: (row.recurrenceFreq ?? "none") as
            "none" | "daily" | "weekly" | "monthly" | "yearly",
          recurrenceByWeekday: row.recurrenceByWeekday ?? "",
          recurrenceInterval: row.recurrenceInterval,
          recurrenceUntil: row.recurrenceUntil
            ? formatLocal(row.recurrenceUntil, "yyyy-MM-dd")
            : "",
          links: row.links ?? [],
          draft: row.draft,
          tags,
        }}
      />
      <FlyerEditor eventId={row.id} initial={row.images ?? []} />
      <form action={del} className="mt-8">
        <Button type="submit" variant="danger-outline" size="lg">
          Delete event
        </Button>
      </form>
    </div>
  );
}
