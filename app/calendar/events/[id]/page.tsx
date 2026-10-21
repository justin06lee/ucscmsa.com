import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db/client";
import { eventCancellations, eventRsvps, events } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { formatLocal } from "@/lib/time";
import type { EventInput } from "@/lib/rrule-lite";
import { resolveOccurrence } from "@/lib/occurrence";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { FadeIn } from "@/components/fade-in";
import { RsvpForm } from "./rsvp-form";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ occurrence?: string }>;
};

type EventRow = typeof events.$inferSelect;

// Shared by generateMetadata and the page within one request.
const loadEvent = cache(async (id: string) => {
  const row = (await db.select().from(events).where(eq(events.id, id)).limit(1))[0];
  if (!row) return null;
  const cancelled = await db
    .select({ date: eventCancellations.occurrenceDate })
    .from(eventCancellations)
    .where(eq(eventCancellations.eventId, id));
  const input: EventInput = {
    id: row.id,
    title: row.title,
    description: row.description,
    location: row.location,
    startTime: row.startTime,
    endTime: row.endTime,
    recurrenceFreq: row.recurrenceFreq,
    recurrenceByWeekday: row.recurrenceByWeekday,
    recurrenceInterval: row.recurrenceInterval,
    recurrenceUntil: row.recurrenceUntil,
    cancellations: cancelled.map((c) => c.date),
  };
  return { row, input };
});

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const loaded = await loadEvent(id);
  if (!loaded) return { title: "Event not found" };
  const { row, input } = loaded;

  const { start } = resolveOccurrence(input, undefined, new Date());
  const dateLabel = formatLocal(start, "EEEE, MMMM d, yyyy 'at' h:mm a");
  const summary = row.description?.trim()
    ? truncate(row.description, 200)
    : `${row.title} on ${dateLabel}${row.location ? ` at ${row.location}` : ""}.`;
  const baseDesc = row.cancelledAt ? `Cancelled. ${summary}` : summary;
  const title = row.cancelledAt ? `Cancelled: ${row.title}` : row.title;

  return {
    title,
    description: baseDesc,
    alternates: { canonical: `/calendar/events/${id}` },
    openGraph: {
      type: "article",
      title,
      description: baseDesc,
      url: `/calendar/events/${id}`,
      publishedTime: row.createdAt.toISOString(),
      modifiedTime: row.updatedAt.toISOString(),
    },
    twitter: {
      card: "summary",
      title,
      description: baseDesc,
    },
  };
}

function eventJsonLd(row: EventRow, start: Date, end: Date): object {
  const place = row.location?.trim()
    ? {
        "@type": "Place",
        name: row.location,
        address: {
          "@type": "PostalAddress",
          addressLocality: "Santa Cruz",
          addressRegion: "CA",
          postalCode: "95064",
          addressCountry: "US",
        },
      }
    : {
        "@type": "Place",
        name: "University of California, Santa Cruz",
        address: {
          "@type": "PostalAddress",
          addressLocality: "Santa Cruz",
          addressRegion: "CA",
          postalCode: "95064",
          addressCountry: "US",
        },
      };

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: row.title,
    description: row.description?.trim() || undefined,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    eventStatus: row.cancelledAt
      ? "https://schema.org/EventCancelled"
      : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: place,
    organizer: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },
    isAccessibleForFree: true,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: `${SITE_URL}/calendar/events/${row.id}`,
    },
    image: [`${SITE_URL}/icon.png`],
    url: `${SITE_URL}/calendar/events/${row.id}`,
  };
}

function ldJson(data: object): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export default async function EventDetail({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const loaded = await loadEvent(id);
  if (!loaded) notFound();
  const { row, input } = loaded;

  const occurrence = resolveOccurrence(input, sp.occurrence, new Date());
  const occurrenceStart = occurrence.start;
  // Cancelled as a whole (by the import). The page stays up, marked cancelled
  // with EventCancelled JSON-LD, so links and search results say so.
  const cancelled = row.cancelledAt != null;
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
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 px-6 py-8 sm:py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: ldJson(eventJsonLd(row, occurrence.start, occurrence.end)),
        }}
      />
      <FadeIn>
        <Link
          href="/calendar"
          className="-ml-1 inline-flex min-h-11 items-center gap-1 px-1 text-sm text-dim transition-colors hover:text-ink"
        >
          <ChevronLeft size={14} />
          Back to calendar
        </Link>
        <h1 className="mt-3 text-3xl leading-tight break-words sm:mt-5 sm:text-4xl">{row.title}</h1>
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
        {cancelled ? (
          <p
            role="status"
            className="mt-6 rounded-md border border-burgundy/30 bg-burgundy/5 px-4 py-3 text-sm font-medium text-burgundy"
          >
            This event was cancelled.
          </p>
        ) : null}
        {row.description && (
          <p className="mt-8 whitespace-pre-wrap text-base leading-relaxed text-ink/85">
            {row.description}
          </p>
        )}
        {!cancelled && (
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
                className="inline-flex min-h-11 items-center rounded-full border border-ink px-5 py-2 text-sm font-medium transition-colors hover:bg-ink hover:text-paper"
              >
                Sign in with UCSC to RSVP
              </Link>
            )}
          </section>
        )}
      </FadeIn>
    </main>
  );
}
