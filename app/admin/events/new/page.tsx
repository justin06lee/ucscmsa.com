import { EventForm } from "@/app/admin/events/event-form";
import { createEvent } from "@/app/admin/_actions";
import { requireAdmin } from "@/lib/auth";

export default async function NewEventPage() {
  await requireAdmin();
  async function submit(fd: FormData) {
    "use server";
    return await createEvent(fd);
  }
  return (
    <div>
      <h1 className="mb-6 text-3xl">New event</h1>
      <EventForm submitLabel="Create event" onSubmit={submit} />
    </div>
  );
}
