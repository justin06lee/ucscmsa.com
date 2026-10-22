import { isValidElement, type ReactNode } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", async () => {
  const { createTestDb } = await import("@/test/db");
  return { db: (await createTestDb()).db };
});
// The event page reads the session for RSVPs; metadata doesn't need it.
vi.mock("@/lib/auth", () => ({ getSession: async () => null }));

import { db } from "@/lib/db/client";
import { events } from "@/lib/db/schema";
import robots from "./robots";
import sitemap from "./sitemap";
import EventPage, { generateMetadata as eventMetadata } from "./calendar/events/[id]/page";
import { generateMetadata as calendarMetadata } from "./calendar/page";

const MALICIOUS = "</script><script>alert(1)</script>";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const fromNow = (ms: number) => new Date(Date.now() + ms);

beforeAll(async () => {
  const at = (iso: string) => new Date(iso);
  await db.insert(events).values([
    {
      id: "ev-gbm",
      title: "General Body Meeting",
      description: "Updates and snacks.",
      location: "Stevenson Event Center",
      startTime: at("2026-10-22T01:00:00.000Z"),
      endTime: at("2026-10-22T02:30:00.000Z"),
      updatedAt: at("2026-10-01T00:00:00.000Z"),
    },
    {
      id: "ev-halaqa",
      title: "Weekly Halaqa",
      location: "Merrill College, Room 102",
      startTime: at("2026-10-01T02:30:00.000Z"),
      endTime: at("2026-10-01T04:00:00.000Z"),
      recurrenceFreq: "weekly",
      recurrenceByWeekday: "WE",
      updatedAt: at("2026-10-10T00:00:00.000Z"),
    },
    {
      // Jummah is a one-off each Friday, never a series (lib/event-rules.ts).
      id: "ev-jummah-1023",
      title: "Jummah Prayer",
      location: "Student Union Assembly Hall",
      startTime: at("2026-10-23T20:15:00.000Z"),
      endTime: at("2026-10-23T21:00:00.000Z"),
      updatedAt: at("2026-10-09T00:00:00.000Z"),
    },
    {
      // Cancelled but still ahead: stays in the sitemap.
      id: "ev-cancelled",
      title: "Beach Cleanup",
      startTime: fromNow(5 * DAY),
      endTime: fromNow(5 * DAY + 2 * HOUR),
      cancelledAt: fromNow(-DAY),
      updatedAt: at("2026-10-19T00:00:00.000Z"),
    },
    {
      // Cancelled and its date has passed: dropped.
      id: "ev-cancelled-past",
      title: "Bake Sale",
      startTime: fromNow(-5 * DAY),
      endTime: fromNow(-5 * DAY + 2 * HOUR),
      cancelledAt: fromNow(-10 * DAY),
      updatedAt: at("2026-10-12T00:00:00.000Z"),
    },
    {
      id: "ev-evil",
      title: MALICIOUS,
      startTime: at("2026-10-24T01:00:00.000Z"),
      endTime: at("2026-10-24T02:00:00.000Z"),
      updatedAt: at("2026-10-05T00:00:00.000Z"),
    },
  ]);
});

const props = (id: string) => ({
  params: Promise.resolve({ id }),
  searchParams: Promise.resolve({}),
});

describe("sitemap", () => {
  it("lists the landing page, the calendar, every event, and cancelled ones only while ahead", async () => {
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.slice(0, 2)).toEqual(["https://ucscmsa.com/", "https://ucscmsa.com/calendar"]);
    expect(urls.slice(2).sort()).toEqual(
      ["ev-cancelled", "ev-evil", "ev-gbm", "ev-halaqa", "ev-jummah-1023"].map(
        (id) => `https://ucscmsa.com/calendar/events/${id}`,
      ),
    );
    expect(urls).not.toContain("https://ucscmsa.com/calendar/events/ev-cancelled-past");
    // Escaped as a URL, never raw markup.
    expect(urls.join(" ")).not.toContain("<");
  });

  it("dates each event by its last edit, and the landing page by the latest one", async () => {
    const entries = await sitemap();
    const by = (u: string) => entries.find((e) => e.url === u)?.lastModified;
    expect(by("https://ucscmsa.com/calendar/events/ev-gbm")).toEqual(new Date("2026-10-01T00:00:00.000Z"));
    // ev-cancelled's edit (Oct 19) is the latest of the listed events.
    expect(by("https://ucscmsa.com/")).toEqual(new Date("2026-10-19T00:00:00.000Z"));
  });
});

describe("robots", () => {
  it("keeps crawlers out of admin and the API and points to the sitemap", () => {
    const r = robots();
    expect(r.rules).toEqual([{ userAgent: "*", allow: "/", disallow: ["/admin", "/api"] }]);
    expect(r.sitemap).toBe("https://ucscmsa.com/sitemap.xml");
  });
});

describe("event page metadata", () => {
  it("is canonical without ?occurrence and uses the event's own share image", async () => {
    const m = await eventMetadata(props("ev-gbm"));
    expect(m.title).toBe("General Body Meeting · Oct 21, 2026");
    expect(m.description).toBe(
      "Wed, Oct 21, 2026 at 6:00 PM, Stevenson Event Center. Updates and snacks.",
    );
    expect(m.alternates?.canonical).toBe("/calendar/events/ev-gbm");
    expect(m.openGraph).toMatchObject({ url: "/calendar/events/ev-gbm", type: "website" });
    expect(m.openGraph).not.toHaveProperty("images");
    expect(m.twitter).toEqual({ card: "summary_large_image" });
  });

  it("titles a weekly series by its day", async () => {
    const m = await eventMetadata(props("ev-halaqa"));
    expect(m.title).toBe("Weekly Halaqa · Wednesdays");
  });

  it("mentions the Jummah spellings on a Friday's Jummah", async () => {
    const m = await eventMetadata(props("ev-jummah-1023"));
    expect(m.title).toBe("Jummah Prayer · Oct 23, 2026");
    expect(m.description).toMatch(/^Jumu'ah \(Jummah\), the Friday prayer/);
  });

  it("says a cancelled event is cancelled", async () => {
    const m = await eventMetadata(props("ev-cancelled"));
    expect(m.title).toMatch(/^Cancelled: Beach Cleanup/);
    expect(m.description).toMatch(/^Cancelled\./);
  });

  it("keeps a hostile title as plain text", async () => {
    const m = await eventMetadata(props("ev-evil"));
    // Next escapes metadata into attributes and <title>; it's the JSON-LD
    // that needs our escaping (lib/seo.test.ts).
    expect(m.title).toBe(`${MALICIOUS} · Oct 23, 2026`);
  });
});

describe("calendar metadata", () => {
  it("points every view at /calendar", async () => {
    for (const sp of [{}, { view: "day" }, { view: "year", date: "2026-01-01" }, { date: "2026-10-20" }]) {
      const m = await calendarMetadata({ searchParams: Promise.resolve(sp) });
      expect(m.alternates?.canonical, JSON.stringify(sp)).toBe("/calendar");
    }
  });
});

// The JSON-LD <script> bodies a server component renders.
function jsonLdBodies(node: ReactNode, out: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((n) => jsonLdBodies(n, out));
  else if (isValidElement<{ type?: string; children?: ReactNode; dangerouslySetInnerHTML?: { __html: string } }>(node)) {
    if (node.type === "script" && node.props.type === "application/ld+json") {
      out.push(node.props.dangerouslySetInnerHTML!.__html);
    }
    jsonLdBodies(node.props.children, out);
  }
  return out;
}

describe("event page JSON-LD", () => {
  it("can't be broken out of by a hostile title", async () => {
    const bodies = jsonLdBodies(await EventPage(props("ev-evil")));
    expect(bodies).toHaveLength(2);
    for (const b of bodies) expect(b).not.toMatch(/<\/?script/i);
    const [event, crumbs] = bodies.map((b) => JSON.parse(b));
    expect(event).toMatchObject({ "@type": "Event", name: MALICIOUS });
    expect(crumbs["@type"]).toBe("BreadcrumbList");
    expect(crumbs.itemListElement.at(-1).name).toBe(MALICIOUS);
  });

  it("gives the next occurrence of a series, with its UTC offset", async () => {
    const [body] = jsonLdBodies(await EventPage(props("ev-halaqa")));
    const ld = JSON.parse(body);
    expect(ld.startDate).toMatch(/^\d{4}-\d{2}-\d{2}T19:30:00-0[78]:00$/);
    expect(new Date(ld.startDate).getTime()).toBeGreaterThan(Date.now() - 60 * 60 * 1000);
  });
});
