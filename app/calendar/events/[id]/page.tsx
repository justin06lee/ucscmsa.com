import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { eventRsvps, events } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { formatLocal } from "@/lib/time";
import { RsvpForm } from "./rsvp-form";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ occurrence?: string }>;
};

export default async function EventDetail({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const row = (await db.select().from(events).where(eq(events.id, id)).limit(1))[0];
  if (!row) notFound();

  const occurrenceStart = sp.occurrence
    ? new Date(sp.occurrence)
    : row.startTime;
  const session = await getSession();

  let myStatus: "yes" | "no" | "maybe" | null = null;
  if (session?.user?.id) {
    const mine = await db
      .select()
      .from(eventRsvps)
      .where(
        and(
          eq(eventRsvps.eventId, id),
          eq(eventRsvps.occurrenceStart, occurrenceStart),
          eq(eventRsvps.userId, session.user.id)
        )
      )
      .limit(1);
    myStatus = (mine[0]?.status as "yes" | "no" | "maybe" | undefined) ?? null;
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <Link href="/calendar" className="text-sm text-dim hover:text-ink">
        ← Back to calendar
      </Link>
      <h1 className="text-3xl font-medium mt-4">{row.title}</h1>
      <div className="mt-2 text-dim">
        {formatLocal(occurrenceStart, "EEEE, MMMM d, yyyy · h:mm a")}
      </div>
      {row.location && <div className="mt-1 text-dim">{row.location}</div>}
      {row.description && (
        <p className="mt-6 whitespace-pre-wrap">{row.description}</p>
      )}
      <section className="mt-8">
        <h2 className="text-sm font-medium mb-2">RSVP</h2>
        {session?.user?.id ? (
          <RsvpForm
            eventId={id}
            occurrenceStart={occurrenceStart.toISOString()}
            current={myStatus}
          />
        ) : (
          <Link
            href="/api/auth/signin"
            className="inline-flex px-4 py-2 rounded-full border border-ink hover:bg-ink hover:text-paper"
          >
            Sign in with UCSC to RSVP
          </Link>
        )}
      </section>
    </main>
  );
}
