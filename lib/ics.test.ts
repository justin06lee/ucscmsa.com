import { describe, expect, it } from "vitest";
import { eventInstants } from "./event-rules";
import { eventIcs, googleCalendarUrl, type CalendarEvent } from "./ics";

const NOW = new Date("2026-10-21T20:00:00.000Z");

function ev(p: Parameters<typeof eventInstants>[0], over: Partial<CalendarEvent> = {}): CalendarEvent {
  const { timing, startTime, endTime } = eventInstants(p);
  return {
    uid: "ev-1-2026-10-23@ucscmsa.com",
    title: "Game Night",
    description: "Board games, cards, chai.\nBring a friend; all welcome.",
    location: "Cowell College",
    url: "https://ucscmsa.com/calendar/events/ev-1",
    start: startTime,
    end: endTime,
    timing,
    ...over,
  };
}

const lines = (ics: string) => ics.split("\r\n");

describe("eventIcs", () => {
  it("writes a timed event in UTC with CRLF lines and escaped text", () => {
    const ics = eventIcs(ev({ date: "2026-10-23", startTime: "18:00", endTime: "20:00" }), NOW);
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
    const l = lines(ics);
    expect(l[0]).toBe("BEGIN:VCALENDAR");
    expect(l).toContain("DTSTART:20261024T010000Z");
    expect(l).toContain("DTEND:20261024T030000Z");
    expect(l).toContain("DTSTAMP:20261021T200000Z");
    expect(l).toContain("SUMMARY:Game Night");
    expect(l).toContain("LOCATION:Cowell College");
    expect(l).toContain("STATUS:CONFIRMED");
    expect(ics.replace(/\r\n /g, "")).toContain("DESCRIPTION:Board games\\, cards\\, chai.\\nBring a friend\\; all welcome.\\n\\nhttps://ucscmsa.com");
  });

  it("makes a date-only event all-day, ending the day after its last day", () => {
    const l = lines(eventIcs(ev({ date: "2026-11-13", endDate: "2026-11-15" }), NOW));
    expect(l).toContain("DTSTART;VALUE=DATE:20261113");
    expect(l).toContain("DTEND;VALUE=DATE:20261116");
  });

  it("gives a start-only event no DTEND rather than inventing an end", () => {
    const ics = eventIcs(ev({ date: "2026-10-23", startTime: "18:00" }), NOW);
    expect(lines(ics)).toContain("DTSTART:20261024T010000Z");
    expect(ics).not.toContain("DTEND");
  });

  it("folds long lines at 75 octets without splitting a character", () => {
    const ics = eventIcs(ev({ date: "2026-10-23", startTime: "18:00", endTime: "20:00" }, { description: "ﷺ ".repeat(60) }), NOW);
    for (const line of lines(ics)) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    // Unfolding gives the text back whole.
    expect(ics.replace(/\r\n /g, "")).toContain("ﷺ ".repeat(60).trim());
  });

  it("marks a cancelled event", () => {
    expect(eventIcs(ev({ date: "2026-10-23" }, { cancelled: true }), NOW)).toContain("STATUS:CANCELLED");
  });
});

describe("googleCalendarUrl", () => {
  const dates = (e: CalendarEvent) => new URL(googleCalendarUrl(e)).searchParams.get("dates");

  it("uses UTC times, all-day dates, or the start twice when the end is unknown", () => {
    expect(dates(ev({ date: "2026-10-23", startTime: "18:00", endTime: "20:00" }))).toBe("20261024T010000Z/20261024T030000Z");
    expect(dates(ev({ date: "2026-10-24" }))).toBe("20261024/20261025");
    expect(dates(ev({ date: "2026-10-23", startTime: "18:00" }))).toBe("20261024T010000Z/20261024T010000Z");
    const u = new URL(googleCalendarUrl(ev({ date: "2026-10-24" })));
    expect(u.origin + u.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(u.searchParams.get("text")).toBe("Game Night");
    expect(u.searchParams.get("location")).toBe("Cowell College");
  });
});
