import { EventForm } from "@/app/admin/events/event-form";
import { createEvent } from "@/app/admin/_actions";

export default function NewEventPage() {
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
