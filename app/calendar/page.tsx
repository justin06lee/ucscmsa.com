import type { Metadata } from "next";
import { Suspense } from "react";
import {
  startOfLocalDayUtc,
  endOfLocalDayUtc,
  startOfSchoolYearUtc,
  endOfSchoolYearUtc,
  monthGridDays,
  SITE_TZ,
} from "@/lib/time";
import { formatInTimeZone } from "date-fns-tz";
import { getOccurrencesInRange } from "@/lib/db/queries";
import { getPrayerTimes } from "@/lib/aladhan";
import { db } from "@/lib/db/client";
import { calendarMetadata } from "@/lib/seo";
import { CalendarNav } from "./calendar-nav";
import { CalendarSkeleton } from "./calendar-skeleton";
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
  // Canonical is /calendar for every view and date (see calendarMetadata).
  return calendarMetadata(
    parseView(sp.view),
    parseDate(sp.date),
    sp.view !== undefined || sp.date !== undefined,
  );
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

  // The title bar is in the first bytes sent (it's the page's largest text,
  // so it sets LCP); only the view waits for events and prayer times. A
  // route-level loading.tsx held the title back with the data.
  return (
    <main id="main" tabIndex={-1} className="group/cal max-w-6xl mx-auto px-4 py-8 w-full flex-1 sm:px-6 sm:py-12">
      <CalendarNav view={view} date={date} />
      <div className="transition-opacity duration-150 group-has-data-pending/cal:opacity-50">
        <Suspense key={`${view}:${ymd}`} fallback={<CalendarSkeleton />}>
          <CalendarBody view={view} ymd={ymd} />
        </Suspense>
      </div>
    </main>
  );
}

async function CalendarBody({ view, ymd }: { view: "day" | "month" | "year"; ymd: string }) {
  if (view === "day") {
    const start = startOfLocalDayUtc(ymd);
    const end = endOfLocalDayUtc(ymd);
    const [occurrences, prayer] = await Promise.all([
      getOccurrencesInRange(start, end),
      getPrayerTimes(ymd, db),
    ]);
    return <DayView ymd={ymd} occurrences={occurrences} prayer={prayer} />;
  }
  if (view === "month") {
    const grid = monthGridDays(ymd);
    const start = startOfLocalDayUtc(grid[0].ymd);
    const end = endOfLocalDayUtc(grid[grid.length - 1].ymd);
    const occurrences = await getOccurrencesInRange(start, end);
    return <MonthView ymd={ymd} occurrences={occurrences} />;
  }
  const start = startOfSchoolYearUtc(ymd);
  const end = endOfSchoolYearUtc(ymd);
  const occurrences = await getOccurrencesInRange(start, end);
  return <YearView ymd={ymd} occurrences={occurrences} />;
}
