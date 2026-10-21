import { z } from "zod";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { SITE_TZ } from "./time";

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
