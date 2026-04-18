import { eq } from "drizzle-orm";
import { prayerTimesCache } from "./db/schema";
import type { DB } from "./db/client";

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

function trimToHm(s: string): string {
  // Aladhan returns "05:18 (PDT)" sometimes — strip to HH:mm.
  const m = s.match(/^(\d{1,2}:\d{2})/);
  return m ? m[1].padStart(5, "0") : s;
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

export async function getPrayerTimes(
  ymd: string,
  db: DB
): Promise<PrayerTimes> {
  const cached = await db
    .select()
    .from(prayerTimesCache)
    .where(eq(prayerTimesCache.date, ymd))
    .limit(1);

  if (cached.length > 0) {
    const row = cached[0];
    return {
      fajr: row.fajr,
      sunrise: row.sunrise,
      dhuhr: row.dhuhr,
      asr: row.asr,
      maghrib: row.maghrib,
      isha: row.isha,
    };
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
