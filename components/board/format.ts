import { formatInTimeZone } from "date-fns-tz";
import { daysBetween } from "@/lib/planning";

/** A YYYY-MM-DD calendar day in date-fns format, with no time-zone shift. */
export function formatYmd(ymd: string, fmt: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return formatInTimeZone(new Date(Date.UTC(y, m - 1, d, 12)), "UTC", fmt);
}

/** "today", "tomorrow", "in 5 days", "yesterday", "5 days ago". */
export function relativeDay(ymd: string, todayYmd: string): string {
  const n = daysBetween(todayYmd, ymd);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}
