import { z } from "zod";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { endOfLocalDayUtc, SITE_TZ, startOfLocalDayUtc } from "./time";
import { IMAGE_ALT_MAX } from "./event-image";

// Field rules shared by the admin event form and the event import API, so an
// event that gets in either way can't break the calendar.

export const TITLE_MAX = 200;
export const LOCATION_MAX = 200;
export const DESCRIPTION_MAX = 10_000;
export const INTERVAL_MAX = 99;
export const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

// A real calendar date in a sane range. The pattern alone let "2026-02-31"
// and "0001-01-01" through: the first became an Invalid Date at insert time,
// the second made every page view expand two thousand years of recurrences.
export function isRealYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return false;
  const year = d.getUTCFullYear();
  return year >= 2000 && year <= 2100;
}

export const realYmd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
  .refine(isRealYmd, "Invalid date");

export const hm = (message: string) =>
  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, message);

export const title = z
  .string()
  .trim()
  .min(1, "Title required")
  .max(TITLE_MAX, "Title is too long");
export const location = z.string().trim().max(LOCATION_MAX, "Location is too long");
export const description = z.string().max(DESCRIPTION_MAX, "Description is too long");
export const interval = z.number().int().min(1).max(INTERVAL_MAX);

// Buttons on the event page, such as an RSVP form or a donation page. Only
// http(s) URLs with a host: no javascript:, data: or mailto: links, and no
// credentials in the URL. Stored as JSON in events.links, label filled in.
export const LINKS_MAX = 5;
export const LINK_LABEL_MAX = 40;
export const LINK_URL_MAX = 500;
export const LINK_KINDS = ["rsvp", "form", "donate", "signup", "map", "other"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];
// The label a link gets when none is given.
export const LINK_KIND_LABELS: Record<LinkKind, string> = {
  rsvp: "RSVP",
  form: "Form",
  donate: "Donate",
  signup: "Sign up",
  map: "Map",
  other: "Link",
};

export function isSafeLinkUrl(s: string): boolean {
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return false;
  }
  return (u.protocol === "https:" || u.protocol === "http:") &&
    u.hostname.includes(".") && !u.username && !u.password;
}

export const eventLink = z
  .strictObject({
    kind: z.enum(LINK_KINDS, `Link kind must be one of ${LINK_KINDS.join(", ")}`),
    label: z
      .string()
      .trim()
      .max(LINK_LABEL_MAX, `Link labels are at most ${LINK_LABEL_MAX} characters`)
      .regex(/^[^\p{Cc}]*$/u, "Link labels can't contain control characters")
      .optional(),
    url: z
      .string()
      .trim()
      .max(LINK_URL_MAX, `Link URLs are at most ${LINK_URL_MAX} characters`)
      .refine(isSafeLinkUrl, "Links must be full http:// or https:// URLs"),
  })
  .transform((l) => ({ kind: l.kind, label: l.label || LINK_KIND_LABELS[l.kind], url: l.url }));
export const eventLinks = z
  .array(eventLink)
  .max(LINKS_MAX, `At most ${LINKS_MAX} links`);
export type EventLink = z.output<typeof eventLink>;

// Image alt text, and the id of an image an event already has (see
// lib/event-image.ts). A blank alt removes it.
export const imageAlt = z
  .string()
  .trim()
  .max(IMAGE_ALT_MAX, `Alt text is at most ${IMAGE_ALT_MAX} characters`)
  .regex(/^[^\p{Cc}]*$/u, "Alt text can't contain control characters");
export const imageId = z.string().regex(/^[0-9a-f]{16}$/, "Not an image id");

/**
 * How a Santa Cruz wall-clock time maps to real time on that date: "ok", or
 * "nonexistent" (skipped when clocks spring forward) or "ambiguous" (happens
 * twice when they fall back).
 */
export function localTimeKind(ymd: string, hm: string): "ok" | "nonexistent" | "ambiguous" {
  const wall = `${ymd} ${hm}`;
  const asPdt = new Date(`${ymd}T${hm}:00-07:00`);
  const asPst = new Date(`${ymd}T${hm}:00-08:00`);
  const fmt = (d: Date) => formatInTimeZone(d, SITE_TZ, "yyyy-MM-dd HH:mm");
  const pdtOk = fmt(asPdt) === wall;
  const pstOk = fmt(asPst) === wall;
  if (pdtOk && pstOk) return "ambiguous";
  if (!pdtOk && !pstOk) return "nonexistent";
  return "ok";
}

/** The instant of a Santa Cruz wall-clock date and time. */
export function localInstant(ymd: string, hm: string): Date {
  return fromZonedTime(`${ymd}T${hm}:00`, SITE_TZ);
}

// How much of an event's time is known. Announcements often give only a date,
// or a start with no end, and nothing is invented to fill the gap:
//  - "timed":      start and end times are known;
//  - "start_only": the start time is known, the end isn't;
//  - "date_only":  only the date (or dates) are known.
// The stored instants stay complete so ranges, sorting and RSVPs need no
// special cases: an unknown start is the start of the Santa Cruz day (so a
// date-only event sorts first in its day), and an unknown end is the end of
// the event's last Santa Cruz day (so it stays upcoming through that day).
export const EVENT_TIMINGS = ["timed", "start_only", "date_only"] as const;
export type EventTiming = (typeof EVENT_TIMINGS)[number];

/** The timing that a start and end time (each optional) describe, or null when only an end time is given. */
export function timingOf(startTime?: string, endTime?: string): EventTiming | null {
  if (startTime && endTime) return "timed";
  if (startTime) return "start_only";
  if (endTime) return null;
  return "date_only";
}

/**
 * The stored start and end instants for an event's local date and optional
 * times. `endDate` defaults to `date`. Throws if only an end time is given;
 * callers validate that first.
 */
export function eventInstants(p: {
  date: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
}): { timing: EventTiming; startTime: Date; endTime: Date } {
  const timing = timingOf(p.startTime, p.endTime);
  if (!timing) throw new Error("An end time needs a start time");
  const endDate = p.endDate || p.date;
  return {
    timing,
    startTime: p.startTime ? localInstant(p.date, p.startTime) : startOfLocalDayUtc(p.date),
    endTime: p.endTime ? localInstant(endDate, p.endTime) : endOfLocalDayUtc(endDate),
  };
}
