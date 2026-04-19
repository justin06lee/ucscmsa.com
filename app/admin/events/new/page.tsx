import { EventForm } from "@/app/admin/events/event-form";
import { createEvent } from "@/app/admin/_actions";

export default function NewEventPage() {
  async function submit(fd: FormData) {
    "use server";
    return await createEvent(fd);
  }
  return (
    <div>
      <h2 className="text-lg font-medium mb-4">New event</h2>
      <EventForm submitLabel="Create event" onSubmit={submit} />
    </div>
  );
}
