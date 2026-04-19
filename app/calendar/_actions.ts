"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { eventRsvps } from "@/lib/db/schema";
import { getSession } from "@/lib/auth";

const rsvpSchema = z.object({
  eventId: z.string(),
  occurrenceStart: z.string().datetime(),
  status: z.enum(["yes", "no", "maybe"]),
});

export async function rsvp(formData: FormData) {
  const session = await getSession();
  if (!session?.user?.id) {
    return { ok: false as const, error: "login_required" };
  }
  const parsed = rsvpSchema.safeParse({
    eventId: formData.get("eventId"),
    occurrenceStart: formData.get("occurrenceStart"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    return { ok: false as const, error: "invalid_input" };
  }
  const { eventId, occurrenceStart, status } = parsed.data;
  const start = new Date(occurrenceStart);
  const userId = session.user.id;

  await db
    .insert(eventRsvps)
    .values({
      eventId,
      occurrenceStart: start,
      userId,
      status,
    })
    .onConflictDoUpdate({
      target: [eventRsvps.eventId, eventRsvps.occurrenceStart, eventRsvps.userId],
      set: { status },
    });

  revalidatePath(`/calendar/events/${eventId}`);
  return { ok: true as const };
}
