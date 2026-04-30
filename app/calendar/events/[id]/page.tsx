import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db/client";
import { eventRsvps, events } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { formatLocal } from "@/lib/time";
import { FadeIn } from "@/components/fade-in";
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
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <FadeIn>
        <Link
          href="/calendar"
          className="inline-flex items-center gap-1 text-sm text-dim transition-colors hover:text-ink"
        >
          <ChevronLeft size={14} />
          Back to calendar
        </Link>
        <h1 className="mt-5 text-4xl leading-tight">{row.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-dim">
          <span className="tabular-nums">
            {formatLocal(occurrenceStart, "EEEE, MMMM d, yyyy")}
          </span>
          <span aria-hidden="true" className="text-ink/20">·</span>
          <span className="tabular-nums">
            {formatLocal(occurrenceStart, "h:mm a")}
          </span>
          {row.location ? (
            <>
              <span aria-hidden="true" className="text-ink/20">·</span>
              <span>{row.location}</span>
            </>
          ) : null}
        </div>
        {row.description && (
          <p className="mt-8 whitespace-pre-wrap text-base leading-relaxed text-ink/85">
            {row.description}
          </p>
        )}
        <section className="mt-10 border-t border-ink/10 pt-6">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-dim">
            RSVP
          </h2>
          {session?.user?.id ? (
            <RsvpForm
              eventId={id}
              occurrenceStart={occurrenceStart.toISOString()}
              current={myStatus}
            />
          ) : (
            <Link
              href="/api/auth/signin"
              className="inline-flex items-center rounded-full border border-ink px-5 py-2 text-sm font-medium transition-colors hover:bg-ink hover:text-paper"
            >
              Sign in with UCSC to RSVP
            </Link>
          )}
        </section>
      </FadeIn>
    </main>
  );
}
