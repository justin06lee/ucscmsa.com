import type { Metadata } from "next";
import {
  startOfLocalDayUtc,
  endOfLocalDayUtc,
  startOfLocalYearUtc,
  endOfLocalYearUtc,
  monthGridDays,
  SITE_TZ,
} from "@/lib/time";
import { formatInTimeZone } from "date-fns-tz";
import { getOccurrencesInRange } from "@/lib/db/queries";
import { getPrayerTimes } from "@/lib/aladhan";
import { db } from "@/lib/db/client";
import { CalendarNav } from "./calendar-nav";
import { DayView } from "./day-view";
import { MonthView } from "./month-view";
import { YearView } from "./year-view";

type SP = { view?: string; date?: string };

function parseView(v?: string): "day" | "month" | "year" {
  return v === "day" || v === "year" ? v : "month";
}

function parseDate(d?: string): Date {
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return new Date(`${d}T12:00:00.000Z`);
  return new Date();
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SP>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const view = parseView(sp.view);
  const date = parseDate(sp.date);
  const label =
    view === "day"
      ? formatInTimeZone(date, SITE_TZ, "EEEE, MMMM d, yyyy")
      : view === "year"
        ? formatInTimeZone(date, SITE_TZ, "yyyy")
        : formatInTimeZone(date, SITE_TZ, "MMMM yyyy");
  return {
    title: `Calendar — ${label}`,
    description:
      "MSA at UCSC events calendar. Day view runs Fajr to Isha for the selected date in Santa Cruz.",
    alternates: { canonical: "/calendar" },
  };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const view = parseView(sp.view);
  const date = parseDate(sp.date);
  const ymd = formatInTimeZone(date, SITE_TZ, "yyyy-MM-dd");

  let content: React.ReactNode;

  if (view === "day") {
    const start = startOfLocalDayUtc(ymd);
    const end = endOfLocalDayUtc(ymd);
    const [occurrences, prayer] = await Promise.all([
      getOccurrencesInRange(start, end),
      getPrayerTimes(ymd, db),
    ]);
    content = <DayView ymd={ymd} occurrences={occurrences} prayer={prayer} />;
  } else if (view === "month") {
    const grid = monthGridDays(ymd);
    const start = startOfLocalDayUtc(grid[0].ymd);
    const end = endOfLocalDayUtc(grid[grid.length - 1].ymd);
    const occurrences = await getOccurrencesInRange(start, end);
    content = <MonthView ymd={ymd} occurrences={occurrences} />;
  } else {
    const start = startOfLocalYearUtc(ymd);
    const end = endOfLocalYearUtc(ymd);
    const occurrences = await getOccurrencesInRange(start, end);
    content = <YearView ymd={ymd} occurrences={occurrences} />;
  }

  return (
    <main className="max-w-6xl mx-auto px-6 py-12 w-full flex-1">
      <CalendarNav view={view} date={date} />
      {content}
    </main>
  );
}
