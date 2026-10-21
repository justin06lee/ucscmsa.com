import { ImageResponse } from "next/og";
import { EventCard, OG_SIZE, ogAssets } from "@/components/og/og-card";
import { resolveOccurrence } from "@/lib/occurrence";
import { recurrenceSummary } from "@/lib/seo";
import { startTimeText } from "@/lib/event-time";
import { formatLocal } from "@/lib/time";
import { loadEvent } from "./load-event";

export const alt = "Event from MSA at UCSC: its name, date, time and place";
export const size = OG_SIZE;
export const contentType = "image/png";
// Shared links get re-fetched rarely; an edit shows up within the hour.
export const revalidate = 3600;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await loadEvent(id);
  if (!loaded) return new Response("Not found", { status: 404 });
  const { row, input } = loaded;
  const { start } = resolveOccurrence(input, undefined, new Date());
  const series = recurrenceSummary(row, start);
  // No time on the card when none was announced, rather than a made-up one.
  const time = startTimeText(start, row.timing);
  const day = series ?? formatLocal(start, "EEEE, MMMM d, yyyy");
  const when = time ? `${day} · ${time}` : day;
  const a = await ogAssets();
  return new ImageResponse(
    <EventCard
      a={a}
      title={row.title}
      when={when}
      where={row.location?.trim() || "UC Santa Cruz"}
      cancelled={row.cancelledAt != null}
    />,
    { ...size, fonts: a.fonts },
  );
}
