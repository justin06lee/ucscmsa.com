import type { MetadataRoute } from "next";
import { db } from "@/lib/db/client";
import { events } from "@/lib/db/schema";
import { SITE_URL } from "@/lib/site";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const rows = await db
    .select({ id: events.id, updatedAt: events.updatedAt })
    .from(events);

  const eventEntries: MetadataRoute.Sitemap = rows.map((r) => ({
    url: `${SITE_URL}/calendar/events/${r.id}`,
    lastModified: r.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/calendar`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    ...eventEntries,
  ];
}
