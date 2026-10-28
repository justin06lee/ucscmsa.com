"use client";

import { useSyncExternalStore } from "react";
import { dayText } from "@/lib/day-label";
import { toLocalYmd } from "@/lib/time";

const noSubscribe = () => () => {};

/**
 * A card's date ("Today", "Tomorrow", or the date) for pages cached for a few
 * minutes, like the landing: the server's day is used for the first paint,
 * then the browser's own day, so a page built before midnight never says
 * "Tomorrow" for an event that is now today.
 */
export function DayText({ iso, today, fmt }: { iso: string; today: string; fmt?: string }) {
  const todayYmd = useSyncExternalStore(noSubscribe, () => toLocalYmd(new Date()), () => today);
  return <>{dayText(new Date(iso), todayYmd, fmt)}</>;
}
