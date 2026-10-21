import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db/client";
import { eventRsvps } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { formatLocal } from "@/lib/time";
import { occurrenceWhen } from "@/lib/event-time";
import { resolveOccurrence } from "@/lib/occurrence";
import { SITE_NAME } from "@/lib/site";
import {
  breadcrumbJsonLd,
  eventDescription,
  eventJsonLd,
  eventTitle,
  eventUrl,
  isJummah,
  jsonLdScript,
  pageMetadata,
} from "@/lib/seo";
import { FadeIn } from "@/components/fade-in";
import { LinkifiedText } from "@/components/linkified-text";
import { loadEvent } from "./load-event";
import { RsvpForm } from "./rsvp-form";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ occurrence?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const loaded = await loadEvent(id);
  if (!loaded) return { title: "Event not found" };
  const { row, input } = loaded;
  // The canonical URL has no ?occurrence, so its title, description and
  // JSON-LD describe the next occurrence.
  const { start } = resolveOccurrence(input, undefined, new Date());
  return pageMetadata({
    title: eventTitle(row, start),
    description: eventDescription(row, start),
    path: eventUrl(id),
    image: "segment",
  });
}

export default async function EventDetail({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const loaded = await loadEvent(id);
  if (!loaded) notFound();
  const { row, input } = loaded;

  const now = new Date();
  const occurrence = resolveOccurrence(input, sp.occurrence, now);
  const occurrenceStart = occurrence.start;
  const when = occurrenceWhen({
    occurrenceStart,
    occurrenceEnd: occurrence.end,
    timing: row.timing,
  });
  // Cancelled as a whole (by the import). The page stays up, marked cancelled
  // with EventCancelled JSON-LD, so links and search results say so.
  const cancelled = row.cancelledAt != null;
  // Over: no RSVP. A series viewed on a past date points at its next one.
  const passed = !cancelled && occurrence.end <= now;
  const next = passed && row.recurrenceFreq ? resolveOccurrence(input, undefined, now) : null;
  const nextUpcoming = next && next.end > now ? next : null;
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
          __html: jsonLdScript(eventJsonLd(row, occurrence.start, occurrence.end)),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            breadcrumbJsonLd([
              { name: SITE_NAME, path: "/" },
              { name: "Calendar", path: "/calendar" },
              { name: row.title, path: eventUrl(id) },
            ]),
          ),
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
          <span className="tabular-nums">{when.date}</span>
          <span aria-hidden="true" className="text-ink/20">·</span>
          <span className="tabular-nums">{when.time}</span>
          {row.location ? (
            <>
              <span aria-hidden="true" className="text-ink/20">·</span>
              <span>{row.location}</span>
            </>
          ) : null}
        </div>
        {isJummah(row.title) ? (
          <p className="mt-4 text-sm leading-relaxed text-dim">
            Jumu&rsquo;ah, also spelled Jummah or Jumuah, is the weekly Friday
            congregational prayer.
          </p>
        ) : null}
        {cancelled ? (
          <p
            role="status"
            className="mt-6 rounded-md border border-burgundy/30 bg-burgundy/5 px-4 py-3 text-sm font-medium text-burgundy"
          >
            This event was cancelled.
          </p>
        ) : null}
        {passed ? (
          <p
            role="status"
            className="mt-6 rounded-md border border-ink/15 bg-ink/[0.03] px-4 py-3 text-sm text-ink/80"
          >
            <span className="font-medium">This event has passed.</span>
            {nextUpcoming ? (
              <>
                {" "}
                <Link href={eventUrl(id)} className="text-burgundy underline underline-offset-2">
                  Next: {formatLocal(nextUpcoming.start, "EEE, MMM d")}
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
        {row.description && (
          <p className="mt-8 whitespace-pre-wrap text-base leading-relaxed text-ink/85">
            <LinkifiedText text={row.description} />
          </p>
        )}
        {!cancelled && !passed && (
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
                // The sign-in page itself, back to this event afterwards. A
                // <Link> to /api/auth/signin was prefetched on every view and
                // its redirect left a request hanging; it also returned home.
                href={`/login?callbackUrl=${encodeURIComponent(eventUrl(id))}`}
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
