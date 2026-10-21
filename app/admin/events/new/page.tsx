import { EventForm } from "@/app/admin/events/event-form";
import { createEvent } from "@/app/admin/_actions";
import { requireAdmin } from "@/lib/auth";

type Props = { searchParams: Promise<{ draft?: string }> };

export default async function NewEventPage({ searchParams }: Props) {
  await requireAdmin();
  // "Plan an event" (from Planning) starts a draft.
  const planning = (await searchParams).draft === "1";
  async function submit(fd: FormData) {
    "use server";
    return await createEvent(fd);
  }
  return (
    <div>
      <h1 className="mb-6 text-3xl">{planning ? "Plan an event" : "New event"}</h1>
      <EventForm submitLabel="Create event" onSubmit={submit} initial={{ draft: planning }} />
    </div>
  );
}
