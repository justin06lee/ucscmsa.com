import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { db } from "@/lib/db/client";
import { eventRsvps } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { formatLocal } from "@/lib/time";
import { occurrenceWhen } from "@/lib/event-time";
import { mapSearchUrl, splitHostedBy, splitLinks } from "@/lib/event-text";
import { toFlyers } from "@/lib/event-media";
import { googleCalendarUrl } from "@/lib/ics";
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
import { EventActions, RsvpLink } from "@/components/event-actions";
import { EventCover } from "@/components/event-cover";
import { buttonClasses } from "@/components/ui/button";
import { FadeIn } from "@/components/fade-in";
import { FlyerGallery } from "@/components/flyer-gallery";
import { LinkifiedText } from "@/components/linkified-text";
import { calendarEvent } from "./calendar-event";
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
  const flyers = toFlyers(row.images, row.title);
  const links = splitLinks(row.links ?? []);
  // Over or called off: nothing left to sign up for.
  const closed = cancelled || passed;
  const primary = closed ? null : links.primary;
  const secondary = closed
    ? links.secondary.filter((l) => !["rsvp", "form", "signup"].includes(l.kind))
    : links.secondary;
  const mapHref = row.location ? (links.map?.url ?? mapSearchUrl(row.location)) : null;
  const { hostedBy, body } = splitHostedBy(row.description ?? "");
  const occurrenceParam = `?occurrence=${encodeURIComponent(occurrenceStart.toISOString())}`;
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
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-6 py-6 sm:py-10">
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
          className="-ml-1 inline-flex min-h-11 items-center px-1 text-sm text-dim transition-colors hover:text-ink"
        >
          Back to the calendar
        </Link>
        {/* After Luma: the cover on the left, the details and RSVP on the
            right; stacked on phones, cover first. */}
        <div className="mt-3 grid gap-7 md:grid-cols-[300px_minmax(0,1fr)] md:items-start md:gap-10 lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-12">
          <div className="md:sticky md:top-6">
            {flyers.length > 0 ? (
              <FlyerGallery title={row.title} flyers={flyers} />
            ) : (
              <EventCover image={null} title={row.title} date={occurrenceStart} className="mx-auto w-full max-w-[380px] rounded-2xl shadow-sm" />
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-3xl leading-tight break-words sm:text-[2.5rem]">{row.title}</h1>
            {hostedBy ? <p className="mt-2 text-sm font-medium text-ink/75">Hosted by {hostedBy}</p> : null}
            <div className="mt-5 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <DateTile date={occurrenceStart} />
                <div className="min-w-0">
                  <p className="font-medium tabular-nums">{when.date}</p>
                  <p className="text-sm tabular-nums text-dim">{when.time}</p>
                </div>
              </div>
              {row.location && mapHref ? (
                <a
                  href={mapHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex min-h-11 items-center gap-3"
                >
                  <span className={TILE}>
                    <MapPin size={18} aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium [overflow-wrap:anywhere] underline decoration-ink/20 underline-offset-4 transition-colors group-hover:decoration-ink/60">
                      {row.location}
                    </span>
                    <span className="block text-sm text-dim">
                      Open the map<span className="sr-only"> (opens in a new tab)</span>
                    </span>
                  </span>
                </a>
              ) : null}
            </div>
            {cancelled ? (
              <p
                role="status"
                className="mt-6 rounded-xl border border-burgundy/30 bg-burgundy/5 px-4 py-3 text-sm font-medium text-burgundy"
              >
                This event was cancelled.
              </p>
            ) : null}
            {passed ? (
              <p
                role="status"
                className="mt-6 rounded-xl border border-ink/15 bg-ink/[0.03] px-4 py-3 text-sm text-ink/80"
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
            {/* One RSVP per page: the event's own form if it has one, else
                the site's. Two would leave people unsure which one counts. */}
            {!closed ? (
              <section
                aria-labelledby="rsvp-heading"
                className="mt-6 rounded-2xl border border-ink/15 bg-paper px-4 py-4 shadow-[0_1px_2px_rgb(21_19_18/0.04)] sm:px-5"
              >
                <h2 id="rsvp-heading" className="leading-none">
                  {/* A span: globals.css sets every h2 in Amiri, above utilities. */}
                  <span className={LABEL}>RSVP</span>
                </h2>
                {primary ? (
                  <>
                    <p className="mt-2 text-sm text-ink/80">The organizers take RSVPs on their own form.</p>
                    <RsvpLink link={primary} className="mt-3 w-full sm:w-auto" />
                  </>
                ) : session?.user?.id ? (
                  <div className="mt-3">
                    <RsvpForm
                      eventId={id}
                      occurrenceStart={occurrenceStart.toISOString()}
                      current={myStatus}
                    />
                  </div>
                ) : (
                  <>
                    <p className="mt-2 text-sm text-ink/80">Let the organizers know you&rsquo;re coming.</p>
                    <Link
                      // The sign-in page itself, back to this event afterwards. A
                      // <Link> to /api/auth/signin was prefetched on every view and
                      // its redirect left a request hanging; it also returned home.
                      href={`/login?callbackUrl=${encodeURIComponent(eventUrl(id))}`}
                      className={`${buttonClasses("primary", "lg")} mt-3 min-h-11 w-full sm:w-auto`}
                    >
                      Sign in with UCSC to RSVP
                    </Link>
                  </>
                )}
              </section>
            ) : null}
            <div className="mt-5">
              <EventActions
                secondary={secondary}
                icsHref={closed ? null : `${eventUrl(id)}/event.ics${occurrenceParam}`}
                googleHref={closed ? null : googleCalendarUrl(calendarEvent(loaded, occurrenceStart.toISOString(), now))}
                title={row.title}
                pageUrl={eventUrl(id)}
              />
            </div>
            {body || isJummah(row.title) ? (
              <section aria-labelledby="about-heading" className="mt-8 border-t border-ink/10 pt-5">
                <h2 id="about-heading" className="leading-none">
                  {/* A span: globals.css sets every h2 in Amiri, above utilities. */}
                  <span className={LABEL}>About this event</span>
                </h2>
                {isJummah(row.title) ? (
                  <p className="mt-3 text-sm leading-relaxed text-dim">
                    Jumu&rsquo;ah, also spelled Jummah or Jumuah, is the weekly Friday
                    congregational prayer.
                  </p>
                ) : null}
                {body ? (
                  <p className="mt-3 whitespace-pre-wrap text-base leading-relaxed text-ink/85">
                    <LinkifiedText text={body} />
                  </p>
                ) : null}
              </section>
            ) : null}
          </div>
        </div>
      </FadeIn>
    </main>
  );
}

const LABEL = "font-sans text-sm font-medium tracking-wide text-dim uppercase";
const TILE = "flex size-10 shrink-0 items-center justify-center rounded-lg border border-ink/15 bg-paper text-ink/75";

/** Luma's little calendar page: the month over the day. */
function DateTile({ date }: { date: Date }) {
  return (
    <span aria-hidden="true" className={`${TILE} flex-col overflow-hidden`}>
      <span className="w-full bg-ink/[0.06] text-center text-[9px] leading-[14px] font-semibold tracking-wide uppercase">
        {formatLocal(date, "MMM")}
      </span>
      <span className="flex-1 text-base leading-[24px] font-medium text-ink">{formatLocal(date, "d")}</span>
    </span>
  );
}
