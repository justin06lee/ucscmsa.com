import { eventIcs } from "@/lib/ics";
import { calendarEvent } from "../calendar-event";
import { loadEvent } from "../load-event";

// "Add to calendar" (Apple, Outlook...): the occurrence the event page shows,
// ?occurrence= picking one date of a series, like the page.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await loadEvent(id);
  if (!loaded) return new Response("Not found", { status: 404 });
  const occurrence = new URL(req.url).searchParams.get("occurrence") ?? undefined;
  const ev = calendarEvent(loaded, occurrence);
  const name = loaded.row.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "event";
  return new Response(eventIcs(ev), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}.ics"`,
      "Cache-Control": "public, max-age=0, s-maxage=300",
      "X-Robots-Tag": "noindex",
    },
  });
}
