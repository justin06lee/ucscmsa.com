import type { MetadataRoute } from "next";
import { db } from "@/lib/db/client";
import { events } from "@/lib/db/schema";
import { absoluteUrl, eventUrl, listedInSitemap } from "@/lib/seo";

export const revalidate = 3600;

// Stable per server boot — used only while there are no events.
const BUILD_DATE = new Date();

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Deleted events are gone from the table; cancelled ones stay while ahead
  // (listedInSitemap).
  const now = new Date();
  const rows = (
    await db
      .select({
        id: events.id,
        updatedAt: events.updatedAt,
        endTime: events.endTime,
        recurrenceFreq: events.recurrenceFreq,
        recurrenceUntil: events.recurrenceUntil,
        cancelledAt: events.cancelledAt,
      })
      .from(events)
  ).filter((r) => listedInSitemap(r, now));

  // The landing page and calendar change when an event does.
  const latest = rows.reduce<Date | null>(
    (max, r) => (max && max >= r.updatedAt ? max : r.updatedAt),
    null,
  );

  return [
    {
      url: absoluteUrl("/"),
      lastModified: latest ?? BUILD_DATE,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: absoluteUrl("/calendar"),
      lastModified: latest ?? BUILD_DATE,
      changeFrequency: "daily",
      priority: 0.9,
    },
    ...rows.map((r) => ({
      url: absoluteUrl(eventUrl(r.id)),
      lastModified: r.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
