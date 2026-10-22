import type { EventTiming } from "./event-rules";
import { toLocalYmd } from "./time";

// "Add to calendar" for one occurrence: an iCalendar (RFC 5545) file and a
// Google Calendar link. Times that weren't announced aren't invented here
// either (see EVENT_TIMINGS in lib/event-rules.ts):
//  - date-only: an all-day event (VALUE=DATE), its end the day after its last;
//  - start-only: DTSTART and no DTEND, which RFC 5545 reads as an event that
//    ends when it starts; Google's link, which needs an end, gets the start
//    twice for the same reason.

export type CalendarEvent = {
  uid: string;
  title: string;
  description?: string | null;
  location?: string | null;
  url: string;
  start: Date;
  end: Date;
  timing: EventTiming;
  cancelled?: boolean;
};

/** 20261023T203000Z */
function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** The Santa Cruz calendar day as 20261023, optionally a few days on. */
function localDate(d: Date, plusDays = 0): string {
  const [y, m, day] = toLocalYmd(d).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day + plusDays)).toISOString().slice(0, 10).replace(/-/g, "");
}

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// Content lines are folded at 75 octets, never inside a UTF-8 character.
const encoder = new TextEncoder();
function fold(line: string): string {
  const parts: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = encoder.encode(ch).length;
    // Continuation lines start with a space, which counts.
    if (bytes + n > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

function details(e: CalendarEvent): string {
  return [e.description?.trim(), e.url].filter(Boolean).join("\n\n");
}

export function eventIcs(e: CalendarEvent, now: Date = new Date()): string {
  const when =
    e.timing === "date_only"
      ? [`DTSTART;VALUE=DATE:${localDate(e.start)}`, `DTEND;VALUE=DATE:${localDate(e.end, 1)}`]
      : e.timing === "start_only"
        ? [`DTSTART:${utcStamp(e.start)}`]
        : [`DTSTART:${utcStamp(e.start)}`, `DTEND:${utcStamp(e.end)}`];
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MSA at UCSC//ucscmsa.com//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${utcStamp(now)}`,
    ...when,
    `SUMMARY:${escapeText(e.title)}`,
    `DESCRIPTION:${escapeText(details(e))}`,
    ...(e.location?.trim() ? [`LOCATION:${escapeText(e.location.trim())}`] : []),
    `URL:${e.url}`,
    `STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function googleCalendarUrl(e: CalendarEvent): string {
  const dates =
    e.timing === "date_only"
      ? `${localDate(e.start)}/${localDate(e.end, 1)}`
      : e.timing === "start_only"
        ? `${utcStamp(e.start)}/${utcStamp(e.start)}`
        : `${utcStamp(e.start)}/${utcStamp(e.end)}`;
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates,
    details: details(e).slice(0, 1500),
    ctz: "America/Los_Angeles",
  });
  if (e.location?.trim()) q.set("location", e.location.trim());
  return `https://calendar.google.com/calendar/render?${q}`;
}
