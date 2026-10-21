import { beforeAll, describe, expect, it, vi } from "vitest";

// A draft event is the board's work in progress: no public read may return it.
// Seeds a draft and a published event side by side and checks each public
// path: calendar range, landing "Upcoming" and "Past events", RSVP check, event page (and its
// metadata, JSON-LD and share image) and the sitemap.

vi.mock("@/lib/db/client", async () => {
  const { createTestDb } = await import("@/test/db");
  return { db: (await createTestDb()).db };
});
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/auth", () => ({ getSession: async () => null }));

import { db } from "@/lib/db/client";
import { events } from "@/lib/db/schema";
import { parseHMInLocal } from "@/lib/time";
import {
  findOccurrence,
  getOccurrencesInRange,
  getPastOccurrences,
  getPublicEventRow,
  getUpcomingOccurrences,
} from "@/lib/db/queries";
import { loadEvent } from "@/app/calendar/events/[id]/load-event";
import sitemap from "@/app/sitemap";
import EventDetail, { generateMetadata } from "@/app/calendar/events/[id]/page";
import Image from "@/app/calendar/events/[id]/opengraph-image";
import { UpcomingEvents } from "@/components/upcoming-events";
import { PastEvents } from "@/components/past-events";
import { renderToStaticMarkup } from "react-dom/server";

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const inDays = (n: number) => ymd(new Date(Date.now() + n * 86_400_000));
const DAY = inDays(5);
const start = parseHMInLocal(DAY, "18:00");
const end = parseHMInLocal(DAY, "20:00");
const PAST = inDays(-5);

beforeAll(async () => {
  await db.insert(events).values([
    { id: "ev-public", title: "Game Night", startTime: start, endTime: end },
    { id: "ev-draft", title: "Secret Planning Dinner", startTime: start, endTime: end, draft: true },
    {
      id: "ev-draft-weekly",
      title: "Draft Series",
      startTime: start,
      endTime: end,
      recurrenceFreq: "weekly",
      recurrenceByWeekday: "MO,TU,WE,TH,FR,SA,SU",
      draft: true,
    },
    { id: "ev-past", title: "Fall Picnic", startTime: parseHMInLocal(PAST, "12:00"), endTime: parseHMInLocal(PAST, "14:00") },
    {
      id: "ev-past-draft",
      title: "Secret Past Draft",
      startTime: parseHMInLocal(PAST, "12:00"),
      endTime: parseHMInLocal(PAST, "14:00"),
      draft: true,
    },
  ]);
});

const page = (id: string) => ({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) });

describe("draft events stay off every public path", () => {
  it("calendar range", async () => {
    const occ = await getOccurrencesInRange(parseHMInLocal(DAY, "00:00"), parseHMInLocal(inDays(20), "00:00"));
    expect(new Set(occ.map((o) => o.eventId))).toEqual(new Set(["ev-public"]));
  });

  it("landing page Upcoming", async () => {
    const up = await getUpcomingOccurrences(10);
    expect(up.map((o) => o.eventId)).toEqual(["ev-public"]);
    const html = renderToStaticMarkup(await UpcomingEvents({ limit: 10 }));
    expect(html).toContain("Game Night");
    expect(html).not.toMatch(/Secret|Draft Series|ev-draft/);
  });

  it("landing page Past events", async () => {
    expect((await getPastOccurrences(10)).map((o) => o.eventId)).toEqual(["ev-past"]);
    const html = renderToStaticMarkup(await PastEvents({ limit: 10 }));
    expect(html).toContain("Fall Picnic");
    expect(html).not.toMatch(/Secret|ev-past-draft/);
  });

  it("the admin's planning reads can ask for drafts", async () => {
    const occ = await getOccurrencesInRange(parseHMInLocal(DAY, "00:00"), parseHMInLocal(inDays(20), "00:00"), {
      includeDrafts: true,
    });
    expect(new Set(occ.map((o) => o.eventId))).toEqual(new Set(["ev-public", "ev-draft", "ev-draft-weekly"]));
  });

  it("RSVP: a draft has no occurrence to RSVP to", async () => {
    expect(await findOccurrence("ev-public", start)).not.toBeNull();
    expect(await findOccurrence("ev-draft", start)).toBeNull();
    expect(await findOccurrence("ev-draft-weekly", start)).toBeNull();
  });

  it("event page 404s, with no title, description or JSON-LD", async () => {
    expect(await loadEvent("ev-draft")).toBeNull();
    await expect(EventDetail(page("ev-draft"))).rejects.toThrow("NEXT_NOT_FOUND");
    const meta = await generateMetadata(page("ev-draft"));
    expect(meta).toEqual({ title: "Event not found" });
    expect(JSON.stringify(meta)).not.toContain("Secret");
    // The published one still renders.
    expect(await loadEvent("ev-public")).not.toBeNull();
  });

  it("share image 404s", async () => {
    const res = (await Image({ params: Promise.resolve({ id: "ev-draft" }) })) as Response;
    expect(res.status).toBe(404);
    expect(await getPublicEventRow("ev-draft")).toBeNull();
    expect(await getPublicEventRow("ev-public")).not.toBeNull();
  });

  it("sitemap", async () => {
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.some((u) => u.endsWith("/calendar/events/ev-public"))).toBe(true);
    expect(urls.filter((u) => u.includes("ev-draft"))).toEqual([]);
  });
});
