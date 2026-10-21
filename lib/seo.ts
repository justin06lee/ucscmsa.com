import type { Metadata } from "next";
import { formatInTimeZone } from "date-fns-tz";
import type { EventTiming } from "./event-rules";
import type { RecurrenceFreq } from "./rrule-lite";
import { SITE_TZ } from "./time";
import {
  SITE_NAME,
  SITE_SAME_AS,
  SITE_SHORT_NAME,
  SITE_TAGLINE,
  SITE_URL,
} from "./site";

const DESCRIPTION_MAX = 160;

/** The site-wide share image (app/opengraph-image.tsx). */
export const DEFAULT_OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: `${SITE_NAME}: Muslim Student Association at UC Santa Cruz`,
};

export const ORG_ID = `${SITE_URL}/#organization`;

const CAMPUS_ADDRESS = {
  "@type": "PostalAddress",
  streetAddress: "1156 High Street",
  addressLocality: "Santa Cruz",
  addressRegion: "CA",
  postalCode: "95064",
  addressCountry: "US",
};

const CAMPUS_PLACE = {
  "@type": "Place",
  name: "University of California, Santa Cruz",
  address: CAMPUS_ADDRESS,
};

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path}`;
}

/**
 * Title, description, canonical, OpenGraph and Twitter for one page.
 * Next merges `openGraph` shallowly, so every page that sets it must bring its
 * own image: `image: "segment"` leaves it to an opengraph-image file next to
 * the page, otherwise the site default is used.
 */
export function pageMetadata({
  title,
  description,
  path,
  absoluteTitle = false,
  image = "default",
}: {
  title: string;
  description: string;
  path: string;
  absoluteTitle?: boolean;
  image?: "default" | "segment";
}): Metadata {
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "en_US",
      title,
      description,
      url: path,
      ...(image === "default" ? { images: [DEFAULT_OG_IMAGE] } : {}),
    },
    // Title, description and image are filled in from openGraph.
    twitter: { card: "summary_large_image" },
  };
}

/** Clip to a search-snippet length at a word boundary. */
export function clip(text: string, max = DESCRIPTION_MAX): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–—-]+$/, "")}…`;
}

/**
 * Serialize for <script type="application/ld+json">. JSON.stringify leaves "<"
 * alone, so a title like `</script><script>…` would end the tag early; escaping
 * <, > and & as \u00XX keeps the JSON identical once parsed.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** ISO 8601 in Santa Cruz local time with its offset, e.g. 2026-10-23T13:15:00-07:00. */
export function isoInSiteTz(d: Date): string {
  return formatInTimeZone(d, SITE_TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

// ---------- Event pages ----------

export type SeoEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  cancelledAt: Date | null;
  recurrenceFreq: RecurrenceFreq | null;
  recurrenceByWeekday: string | null;
  recurrenceInterval: number | null;
  // Which times are known (lib/event-rules.ts); missing means "timed".
  timing?: EventTiming;
};

// Jummah, Jumuah, Jumu'ah, Jumu’ah, Jumah, Jumma, Juma...
const JUMMAH = /\bjum+u?['’]?u?a+h?\b/i;

export function isJummah(title: string): boolean {
  return JUMMAH.test(title);
}

const WEEKDAYS: Record<string, string> = {
  SU: "Sunday",
  MO: "Monday",
  TU: "Tuesday",
  WE: "Wednesday",
  TH: "Thursday",
  FR: "Friday",
  SA: "Saturday",
};

function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} & ${items.at(-1)}`;
}

/** "Fridays", "Mondays & Wednesdays", "Every other Friday", "Daily", "Monthly"... */
export function recurrenceSummary(ev: SeoEvent, start: Date): string | null {
  const n = Math.max(1, ev.recurrenceInterval ?? 1);
  switch (ev.recurrenceFreq) {
    case null:
      return null;
    case "daily":
      return n === 1 ? "Daily" : `Every ${n} days`;
    case "monthly":
      return n === 1 ? "Monthly" : `Every ${n} months`;
    case "yearly":
      return n === 1 ? "Yearly" : `Every ${n} years`;
    case "weekly": {
      const codes = (ev.recurrenceByWeekday ?? "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s in WEEKDAYS);
      const days = codes.length
        ? codes.map((c) => WEEKDAYS[c])
        : [formatInTimeZone(start, SITE_TZ, "EEEE")];
      const plural = listJoin(days.map((d) => `${d}s`));
      if (n === 1) return plural;
      if (n === 2) return days.length === 1 ? `Every other ${days[0]}` : `Every other week on ${plural}`;
      return `Every ${n} weeks on ${plural}`;
    }
  }
}

/** Page title (before the site suffix): the date for one-offs, the pattern for series. */
export function eventTitle(ev: SeoEvent, start: Date): string {
  const when = recurrenceSummary(ev, start) ?? formatInTimeZone(start, SITE_TZ, "MMM d, yyyy");
  const base = `${ev.title} · ${when}`;
  return ev.cancelledAt ? `Cancelled: ${base}` : base;
}

/** Meta description: when, where, then the event's own text. */
export function eventDescription(ev: SeoEvent, start: Date): string {
  // A date-only event gets no time, rather than the 12:00 AM it is stored at.
  const time = ev.timing === "date_only" ? null : formatInTimeZone(start, SITE_TZ, "h:mm a");
  const day =
    recurrenceSummary(ev, start) ?? formatInTimeZone(start, SITE_TZ, "EEE, MMM d, yyyy");
  const when = time ? `${day} at ${time}` : day;
  const where = ev.location?.trim() || "UC Santa Cruz";
  const parts = [
    ev.cancelledAt ? "Cancelled." : null,
    isJummah(ev.title)
      ? "Jumu'ah (Jummah), the Friday prayer, with the MSA at UC Santa Cruz."
      : null,
    `${when}, ${where}.`,
    ev.description?.trim() || `${ev.title} with the ${SITE_SHORT_NAME}.`,
  ];
  return clip(parts.filter(Boolean).join(" "));
}

export function eventUrl(id: string): string {
  return `/calendar/events/${encodeURIComponent(id)}`;
}

/**
 * schema.org startDate/endDate for an occurrence. A date-only event gets plain
 * dates, with an endDate only when it runs past its first day; a start-only
 * one gets no endDate. Neither ever carries the stored 00:00 / 23:59 stand-ins.
 */
function eventDates(ev: SeoEvent, start: Date, end: Date): { startDate: string; endDate?: string } {
  if (ev.timing === "date_only") {
    const first = formatInTimeZone(start, SITE_TZ, "yyyy-MM-dd");
    const last = formatInTimeZone(end, SITE_TZ, "yyyy-MM-dd");
    return last > first ? { startDate: first, endDate: last } : { startDate: first };
  }
  if (ev.timing === "start_only") return { startDate: isoInSiteTz(start) };
  return { startDate: isoInSiteTz(start), endDate: isoInSiteTz(end) };
}

/**
 * schema.org Event for one occurrence, per Google's event rich results:
 * local times with offset, a Place with an address, status and attendance mode.
 * A named location gets the city-level address only: it may be off campus,
 * so it doesn't borrow the campus street address.
 */
export function eventJsonLd(ev: SeoEvent, start: Date, end: Date): Record<string, unknown> {
  const url = absoluteUrl(eventUrl(ev.id));
  const cancelled = ev.cancelledAt != null;
  const location = ev.location?.trim()
    ? {
        "@type": "Place",
        name: ev.location.trim(),
        address: {
          "@type": "PostalAddress",
          addressLocality: "Santa Cruz",
          addressRegion: "CA",
          addressCountry: "US",
        },
      }
    : CAMPUS_PLACE;
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: ev.title,
    ...(ev.description?.trim() ? { description: ev.description.trim() } : {}),
    ...eventDates(ev, start, end),
    eventStatus: cancelled
      ? "https://schema.org/EventCancelled"
      : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location,
    organizer: { "@type": "Organization", "@id": ORG_ID, name: SITE_NAME, url: SITE_URL },
    isAccessibleForFree: true,
    ...(cancelled
      ? {}
      : {
          offers: {
            "@type": "Offer",
            price: 0,
            priceCurrency: "USD",
            availability: "https://schema.org/InStock",
            url,
          },
        }),
    image: [`${url}/opengraph-image`],
    url,
  };
}

// ---------- Sitemap ----------

// A cancelled event stays listed while it is still ahead, so crawlers re-read
// its page and pick up EventCancelled (what Google asks for cancelled events),
// and drops out once its date has passed: a one-off at its end time, a series
// at its recurrenceUntil, or 4 weeks after it was cancelled if it had no end.
const CANCELLED_SERIES_GRACE_MS = 28 * 24 * 60 * 60 * 1000;

type SitemapRow = {
  endTime: Date;
  recurrenceFreq: string | null;
  recurrenceUntil: Date | null;
  cancelledAt: Date | null;
};

export function listedInSitemap(r: SitemapRow, now: Date): boolean {
  if (!r.cancelledAt) return true;
  if (!r.recurrenceFreq) return r.endTime > now;
  const last = r.recurrenceUntil ?? new Date(r.cancelledAt.getTime() + CANCELLED_SERIES_GRACE_MS);
  return last > now;
}

// ---------- Site-wide ----------

export function organizationJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE_NAME,
    alternateName: [
      SITE_SHORT_NAME,
      "Muslim Student Association at UC Santa Cruz",
      "Muslim Student Association at UCSC",
    ],
    url: SITE_URL,
    logo: `${SITE_URL}/letters/icon-1.png`,
    image: `${SITE_URL}/letters/icon-1.png`,
    description: SITE_TAGLINE,
    parentOrganization: {
      "@type": "CollegeOrUniversity",
      name: "University of California, Santa Cruz",
      url: "https://www.ucsc.edu",
    },
    location: CAMPUS_PLACE,
    ...(SITE_SAME_AS.length ? { sameAs: SITE_SAME_AS } : {}),
  };
}

/** WebSite name + alternateName are what Google shows as the site name. */
export function websiteJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    alternateName: [SITE_SHORT_NAME, "Muslim Student Association at UC Santa Cruz"],
    url: SITE_URL,
    publisher: { "@id": ORG_ID },
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: absoluteUrl(it.path),
    })),
  };
}

// ---------- Calendar ----------

export type CalendarView = "day" | "month" | "year";

/**
 * Every calendar URL canonicalizes to /calendar: ?view= and ?date= open an
 * endless run of time-sliced views of the same events (each event has its own
 * indexable page), so only the bare calendar is put forward for search.
 * Titles still name the date shown, for tabs and history.
 */
export function calendarMetadata(view: CalendarView, date: Date, hasParams: boolean): Metadata {
  if (!hasParams) {
    return pageMetadata({
      title: "Events calendar & prayer times",
      description:
        "Upcoming UCSC MSA events: Jummah, halaqas, socials and more, by day, month or year, with Fajr to Isha prayer times for Santa Cruz each day.",
      path: "/calendar",
    });
  }
  if (view === "day") {
    const label = formatInTimeZone(date, SITE_TZ, "EEEE, MMMM d, yyyy");
    return pageMetadata({
      title: `${formatInTimeZone(date, SITE_TZ, "EEE, MMM d, yyyy")}: events & prayer times`,
      description: `Fajr, Dhuhr, Asr, Maghrib and Isha prayer times in Santa Cruz for ${label}, with the day's ${SITE_SHORT_NAME} events.`,
      path: "/calendar",
    });
  }
  if (view === "year") {
    const y = formatInTimeZone(date, SITE_TZ, "yyyy");
    return pageMetadata({
      title: `${y} events calendar`,
      description: `Every ${SITE_SHORT_NAME} event in ${y}, month by month: Jummah, halaqas, socials and more at UC Santa Cruz.`,
      path: "/calendar",
    });
  }
  const m = formatInTimeZone(date, SITE_TZ, "MMMM yyyy");
  return pageMetadata({
    title: `${m} events`,
    description: `${SITE_SHORT_NAME} events in ${m}: Jummah, halaqas, socials and more at UC Santa Cruz.`,
    path: "/calendar",
  });
}
