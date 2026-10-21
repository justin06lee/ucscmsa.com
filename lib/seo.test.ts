import { describe, expect, it } from "vitest";
import {
  calendarMetadata,
  clip,
  eventDescription,
  eventJsonLd,
  eventTitle,
  isJummah,
  isoInSiteTz,
  jsonLdScript,
  organizationJsonLd,
  pageMetadata,
  recurrenceSummary,
  websiteJsonLd,
  type SeoEvent,
} from "./seo";

const MALICIOUS = `</script><script>alert(1)</script><!-- & "quotes"  `;

function ev(over: Partial<SeoEvent> = {}): SeoEvent {
  return {
    id: "ev-1",
    title: "General Body Meeting",
    description: "Updates, plans for the quarter, and snacks.",
    location: "Stevenson Event Center",
    cancelledAt: null,
    recurrenceFreq: null,
    recurrenceByWeekday: null,
    recurrenceInterval: 1,
    ...over,
  };
}

// 1:15 PM in Santa Cruz: PDT (-07:00) in October, PST (-08:00) in January.
const OCT = new Date("2026-10-23T20:15:00.000Z");
const OCT_END = new Date("2026-10-23T21:00:00.000Z");
const JAN = new Date("2027-01-08T21:15:00.000Z");

describe("jsonLdScript", () => {
  it("can't close the script tag, whatever the event title", () => {
    const out = jsonLdScript(eventJsonLd(ev({ title: MALICIOUS, description: MALICIOUS }), OCT, OCT_END));
    expect(out).not.toMatch(/<\/script/i);
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(out).not.toContain("<!--");
    expect(out).not.toContain(" ");
    // Same data once parsed.
    expect(JSON.parse(out).name).toBe(MALICIOUS);
    expect(JSON.parse(out).description).toBe(MALICIOUS.trim());
  });
});

describe("isoInSiteTz", () => {
  it("writes Santa Cruz local time with its DST offset", () => {
    expect(isoInSiteTz(OCT)).toBe("2026-10-23T13:15:00-07:00");
    expect(isoInSiteTz(JAN)).toBe("2027-01-08T13:15:00-08:00");
  });
});

describe("eventJsonLd", () => {
  it("has what Google's event rich results need", () => {
    const ld = eventJsonLd(ev(), OCT, OCT_END);
    expect(ld).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Event",
      name: "General Body Meeting",
      startDate: "2026-10-23T13:15:00-07:00",
      endDate: "2026-10-23T14:00:00-07:00",
      eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      location: {
        "@type": "Place",
        name: "Stevenson Event Center",
        address: { "@type": "PostalAddress", addressLocality: "Santa Cruz", addressRegion: "CA" },
      },
      organizer: { "@type": "Organization", name: "MSA at UCSC", url: "https://ucscmsa.com" },
      url: "https://ucscmsa.com/calendar/events/ev-1",
      image: ["https://ucscmsa.com/calendar/events/ev-1/opengraph-image"],
    });
    expect(ld.offers).toMatchObject({ price: 0, priceCurrency: "USD" });
  });

  it("marks a cancelled event EventCancelled and drops the offer", () => {
    const ld = eventJsonLd(ev({ cancelledAt: new Date() }), OCT, OCT_END);
    expect(ld.eventStatus).toBe("https://schema.org/EventCancelled");
    expect(ld.offers).toBeUndefined();
  });

  it("uses the campus address when there's no location", () => {
    const ld = eventJsonLd(ev({ location: "" }), OCT, OCT_END);
    expect(ld.location).toMatchObject({
      name: "University of California, Santa Cruz",
      address: { streetAddress: "1156 High Street", postalCode: "95064" },
    });
  });

  it("leaves out an empty description", () => {
    expect(eventJsonLd(ev({ description: "  " }), OCT, OCT_END)).not.toHaveProperty("description");
  });
});

describe("site JSON-LD", () => {
  it("names the Organization and WebSite with UCSC MSA as an alternate", () => {
    const org = organizationJsonLd();
    expect(org).toMatchObject({ "@type": "Organization", name: "MSA at UCSC", url: "https://ucscmsa.com" });
    expect(org.alternateName).toContain("UCSC MSA");
    expect(org.logo).toBe("https://ucscmsa.com/letters/icon-1.png");
    // No social profiles are confirmed yet, so no sameAs at all.
    expect(org).not.toHaveProperty("sameAs");
    expect(websiteJsonLd().alternateName).toContain("UCSC MSA");
  });
});

describe("event titles and descriptions", () => {
  it("spots the spellings of Jummah", () => {
    for (const t of ["Jummah Prayer", "Jumuah", "Jumu'ah khutbah", "Jumu’ah", "Jumah", "JUMMA"]) {
      expect(isJummah(t), t).toBe(true);
    }
    for (const t of ["Jumble sale", "General Body Meeting", "Halaqa"]) {
      expect(isJummah(t), t).toBe(false);
    }
  });

  it("describes a weekly series by its days", () => {
    const weekly = ev({ recurrenceFreq: "weekly", recurrenceByWeekday: "FR" });
    expect(recurrenceSummary(weekly, OCT)).toBe("Fridays");
    expect(recurrenceSummary(ev({ recurrenceFreq: "weekly", recurrenceByWeekday: "MO,WE" }), OCT)).toBe(
      "Mondays & Wednesdays",
    );
    expect(recurrenceSummary(ev({ recurrenceFreq: "weekly", recurrenceByWeekday: null }), OCT)).toBe(
      "Fridays",
    );
    expect(recurrenceSummary({ ...weekly, recurrenceInterval: 2 }, OCT)).toBe("Every other Friday");
    expect(recurrenceSummary(ev({ recurrenceFreq: "monthly" }), OCT)).toBe("Monthly");
    expect(recurrenceSummary(ev(), OCT)).toBeNull();
  });

  it("titles one-offs by date and series by pattern", () => {
    expect(eventTitle(ev(), OCT)).toBe("General Body Meeting · Oct 23, 2026");
    expect(
      eventTitle(ev({ title: "Jummah Prayer", recurrenceFreq: "weekly", recurrenceByWeekday: "FR" }), OCT),
    ).toBe("Jummah Prayer · Fridays");
    expect(eventTitle(ev({ cancelledAt: new Date() }), OCT)).toBe(
      "Cancelled: General Body Meeting · Oct 23, 2026",
    );
  });

  it("says when and where first, and covers the Jummah spellings", () => {
    expect(eventDescription(ev(), OCT)).toBe(
      "Fri, Oct 23, 2026 at 1:15 PM, Stevenson Event Center. Updates, plans for the quarter, and snacks.",
    );
    const jummah = eventDescription(
      ev({
        title: "Jummah Prayer",
        description: "Khutbah and congregational prayer.",
        location: "Student Union Assembly Hall",
        recurrenceFreq: "weekly",
        recurrenceByWeekday: "FR",
      }),
      OCT,
    );
    expect(jummah).toBe(
      "Jumu'ah (Jummah), the Friday prayer, with the MSA at UC Santa Cruz. Fridays at 1:15 PM, Student Union Assembly Hall. Khutbah and congregational prayer.",
    );
    expect(eventDescription(ev({ cancelledAt: new Date() }), OCT)).toMatch(/^Cancelled\. /);
  });

  it("keeps descriptions to snippet length", () => {
    const long = eventDescription(ev({ description: "word ".repeat(100) }), OCT);
    expect(long.length).toBeLessThanOrEqual(160);
    expect(long.endsWith("…")).toBe(true);
    expect(clip("short")).toBe("short");
  });
});

describe("pageMetadata", () => {
  it("sets canonical, OpenGraph and a large Twitter card", () => {
    const m = pageMetadata({ title: "T", description: "D", path: "/calendar" });
    expect(m.alternates?.canonical).toBe("/calendar");
    expect(m.openGraph).toMatchObject({ title: "T", description: "D", url: "/calendar", type: "website" });
    expect(m.openGraph?.images).toEqual([expect.objectContaining({ url: "/opengraph-image", width: 1200 })]);
    expect(m.twitter).toEqual({ card: "summary_large_image" });
  });

  it("leaves the image to the page's own opengraph-image file when asked", () => {
    const m = pageMetadata({ title: "T", description: "D", path: "/x", image: "segment" });
    expect(m.openGraph).not.toHaveProperty("images");
  });
});

describe("calendarMetadata", () => {
  it("canonicalizes every view and date to /calendar", () => {
    for (const view of ["day", "month", "year"] as const) {
      expect(calendarMetadata(view, OCT, true).alternates?.canonical).toBe("/calendar");
    }
    expect(calendarMetadata("month", OCT, false).alternates?.canonical).toBe("/calendar");
  });

  it("titles each view by what it shows", () => {
    expect(calendarMetadata("month", OCT, false).title).toBe("Events calendar & prayer times");
    expect(calendarMetadata("day", OCT, true).title).toBe("Fri, Oct 23, 2026: events & prayer times");
    expect(calendarMetadata("month", OCT, true).title).toBe("October 2026 events");
    expect(calendarMetadata("year", OCT, true).title).toBe("2026 events calendar");
  });
});
