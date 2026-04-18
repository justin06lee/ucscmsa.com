import {
  startOfLocalDayUtc,
  endOfLocalDayUtc,
  startOfLocalMonthUtc,
  endOfLocalMonthUtc,
  startOfLocalYearUtc,
  endOfLocalYearUtc,
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
  return v === "month" || v === "year" ? v : "day";
}

function parseDate(d?: string): Date {
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return new Date(`${d}T12:00:00.000Z`);
  return new Date();
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
    const start = startOfLocalMonthUtc(ymd);
    const end = endOfLocalMonthUtc(ymd);
    const occurrences = await getOccurrencesInRange(start, end);
    content = <MonthView date={date} occurrences={occurrences} />;
  } else {
    const start = startOfLocalYearUtc(ymd);
    const end = endOfLocalYearUtc(ymd);
    const occurrences = await getOccurrencesInRange(start, end);
    content = <YearView date={date} occurrences={occurrences} />;
  }

  return (
    <main className="max-w-6xl mx-auto px-6 py-12 w-full flex-1">
      <CalendarNav view={view} date={date} />
      {content}
    </main>
  );
}
