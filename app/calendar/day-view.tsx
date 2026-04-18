"use client";
import type { Occurrence } from "@/lib/rrule-lite";
import type { PrayerTimes } from "@/lib/aladhan";
export function DayView(props: { ymd: string; occurrences: Occurrence[]; prayer: PrayerTimes }) {
  return <div>Day view for {props.ymd} (stub)</div>;
}
