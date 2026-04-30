import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db/client";
import { eventRsvps, events } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { formatLocal } from "@/lib/time";
import { expandEvents } from "@/lib/rrule-lite";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { FadeIn } from "@/components/fade-in";
import { RsvpForm } from "./rsvp-form";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ occurrence?: string }>;
};

type EventRow = typeof events.$inferSelect;

function nextOccurrence(row: EventRow): { start: Date; end: Date } {
  if (!row.recurrenceFreq) {
    return { start: row.startTime, end: row.endTime };
  }
  const now = new Date();
  const oneYearOut = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  const occurrences = expandEvents(
    [
      {
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
        cancellations: [],
      },
    ],
    now,
    oneYearOut,
  );
  if (occurrences.length > 0) {
    return {
      start: occurrences[0].occurrenceStart,
      end: occurrences[0].occurrenceEnd,
    };
  }
  return { start: row.startTime, end: row.endTime };
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const row = (
    await db.select().from(events).where(eq(events.id, id)).limit(1)
  )[0];
  if (!row) return { title: "Event not found" };

  const { start } = nextOccurrence(row);
  const dateLabel = formatLocal(start, "EEEE, MMMM d, yyyy 'at' h:mm a");
  const baseDesc = row.description?.trim()
    ? truncate(row.description, 200)
    : `${row.title} on ${dateLabel}${row.location ? ` at ${row.location}` : ""}.`;

  return {
    title: row.title,
    description: baseDesc,
    alternates: { canonical: `/calendar/events/${id}` },
    openGraph: {
      type: "article",
      title: row.title,
      description: baseDesc,
      url: `/calendar/events/${id}`,
      publishedTime: row.createdAt.toISOString(),
      modifiedTime: row.updatedAt.toISOString(),
    },
    twitter: {
      card: "summary",
      title: row.title,
      description: baseDesc,
    },
  };
}

function eventJsonLd(row: EventRow): object {
  const { start, end } = nextOccurrence(row);
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
    eventStatus: "https://schema.org/EventScheduled",
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ldJson(eventJsonLd(row)) }}
      />
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
