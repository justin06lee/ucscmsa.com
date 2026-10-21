import { eq } from "drizzle-orm";
import { prayerTimesCache } from "./db/schema";
import type { DB } from "./db/client";
import { toLocalYmd } from "./time";

export type PrayerTimes = {
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
};

export const DEFAULT_PRAYER_TIMES: PrayerTimes = {
  fajr: "05:30",
  sunrise: "06:45",
  dhuhr: "12:30",
  asr: "15:30",
  maghrib: "18:30",
  isha: "20:00",
};

const LAT = 36.974;
const LON = -122.031;
const METHOD = 2; // ISNA

const DAY_MS = 24 * 60 * 60 * 1000;
const PAST_TTL_MS = 90 * DAY_MS;
const FUTURE_TTL_MS = 7 * DAY_MS;
// Only dates within this many days of today are written to the cache. Any
// visitor can ask for any date (/calendar?view=day&date=…), and caching every
// one let anyone fill the table with millions of rows, each a billed write.
const CACHE_WINDOW_DAYS = 730;

// HH:mm with HH in 00-23 and MM in 00-59. Aladhan sometimes appends timezone
// suffixes like "05:18 (PDT)" so we anchor only to the start.
const HM_RE = /^([01]\d|2[0-3]):([0-5]\d)/;

export function trimToHm(s: string): string {
  const m = s.match(HM_RE);
  if (!m) {
    console.warn(`[aladhan] malformed time string: ${JSON.stringify(s)}`);
    return "00:00";
  }
  return `${m[1]}:${m[2]}`;
}

async function fetchAladhan(ymd: string): Promise<PrayerTimes> {
  const [y, m, d] = ymd.split("-");
  const url = `https://api.aladhan.com/v1/timings/${d}-${m}-${y}?latitude=${LAT}&longitude=${LON}&method=${METHOD}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Aladhan ${res.status}`);
  const json = (await res.json()) as {
    data: { timings: Record<string, string> };
  };
  const t = json.data.timings;
  return {
    fajr: trimToHm(t.Fajr),
    sunrise: trimToHm(t.Sunrise),
    dhuhr: trimToHm(t.Dhuhr),
    asr: trimToHm(t.Asr),
    maghrib: trimToHm(t.Maghrib),
    isha: trimToHm(t.Isha),
  };
}

// A real calendar date: "2026-02-31" and "2026-13-45" match the YYYY-MM-DD
// pattern but aren't.
function isRealYmd(ymd: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const d = new Date(`${ymd}T12:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === ymd;
}

function isWithinCacheWindow(ymd: string, now: Date): boolean {
  const days = (Date.parse(`${ymd}T12:00:00.000Z`) - Date.parse(`${toLocalYmd(now)}T12:00:00.000Z`)) / DAY_MS;
  return Math.abs(days) <= CACHE_WINDOW_DAYS;
}

function isStale(ymd: string, cachedAt: Date, now: Date): boolean {
  const ageMs = now.getTime() - cachedAt.getTime();
  const isPast = ymd < toLocalYmd(now);
  const ttl = isPast ? PAST_TTL_MS : FUTURE_TTL_MS;
  return ageMs > ttl;
}

function rowToTimes(row: {
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}): PrayerTimes {
  return {
    fajr: row.fajr,
    sunrise: row.sunrise,
    dhuhr: row.dhuhr,
    asr: row.asr,
    maghrib: row.maghrib,
    isha: row.isha,
  };
}

export async function getPrayerTimes(
  ymd: string,
  db: DB,
  now: Date = new Date()
): Promise<PrayerTimes> {
  if (!isRealYmd(ymd)) return DEFAULT_PRAYER_TIMES;
  if (!isWithinCacheWindow(ymd, now)) {
    // Far-off dates are still looked up, just never stored.
    try {
      return await fetchAladhan(ymd);
    } catch (err) {
      console.warn(`[aladhan] fetch failed for ${ymd}:`, err);
      return DEFAULT_PRAYER_TIMES;
    }
  }

  const cached = await db
    .select()
    .from(prayerTimesCache)
    .where(eq(prayerTimesCache.date, ymd))
    .limit(1);

  if (cached.length > 0) {
    const row = cached[0];
    if (!isStale(ymd, row.cachedAt, now)) {
      return rowToTimes(row);
    }

    // Stale: try to refresh. On failure, fall back to the stale row rather
    // than the generic defaults — yesterday's real times beat made-up ones.
    try {
      const times = await fetchAladhan(ymd);
      await db
        .insert(prayerTimesCache)
        .values({ date: ymd, ...times })
        .onConflictDoUpdate({
          target: prayerTimesCache.date,
          set: { ...times, cachedAt: now },
        });
      return times;
    } catch (err) {
      console.warn(`[aladhan] refresh failed for ${ymd}, serving stale:`, err);
      return rowToTimes(row);
    }
  }

  try {
    const times = await fetchAladhan(ymd);
    await db.insert(prayerTimesCache).values({ date: ymd, ...times });
    return times;
  } catch (err) {
    console.warn(`[aladhan] fetch failed for ${ymd}:`, err);
    return DEFAULT_PRAYER_TIMES;
  }
}
