import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { events } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { EventForm } from "@/app/admin/events/event-form";
import { deleteEvent, updateEvent } from "@/app/admin/_actions";
import { formatLocal } from "@/lib/time";

type Props = { params: Promise<{ id: string }> };

export default async function EditEventPage({ params }: Props) {
  const { id } = await params;
  const row = (await db.select().from(events).where(eq(events.id, id)).limit(1))[0];
  if (!row) notFound();

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
      <h2 className="text-lg font-medium mb-4">Edit event</h2>
      <EventForm
        submitLabel="Save"
        onSubmit={submit}
        initial={{
          id: row.id,
          title: row.title,
          description: row.description,
          location: row.location,
          startDate: formatLocal(row.startTime, "yyyy-MM-dd"),
          startTime: formatLocal(row.startTime, "HH:mm"),
          endDate: formatLocal(row.endTime, "yyyy-MM-dd"),
          endTime: formatLocal(row.endTime, "HH:mm"),
          recurrenceFreq: (row.recurrenceFreq ?? "none") as
            "none" | "daily" | "weekly" | "monthly" | "yearly",
          recurrenceByWeekday: row.recurrenceByWeekday ?? "",
          recurrenceInterval: row.recurrenceInterval,
          recurrenceUntil: row.recurrenceUntil
            ? formatLocal(row.recurrenceUntil, "yyyy-MM-dd")
            : "",
        }}
      />
      <form action={del} className="mt-8">
        <button type="submit"
          className="px-4 py-2 rounded-full border border-burgundy text-burgundy hover:bg-burgundy hover:text-paper">
          Delete event
        </button>
      </form>
    </div>
  );
}
