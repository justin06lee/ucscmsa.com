import { formatLocal, toLocalYmd } from "./time";

// Dates read as "Today" and "Tomorrow" when they are (Justin's ask), in the
// site's timezone, like every other day on the site. Anything else keeps its
// date. `todayYmd` is passed in, not read here, so a page cached for minutes
// (the landing) can work it out again in the browser (components/day-text.tsx).

/** The local day after `ymd` (yyyy-MM-dd), across month and year ends. */
export function nextYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** "Today" or "Tomorrow" for a date on those local days, else null. */
export function relativeDay(date: Date, todayYmd: string): "Today" | "Tomorrow" | null {
  const ymd = toLocalYmd(date);
  if (ymd === todayYmd) return "Today";
  if (ymd === nextYmd(todayYmd)) return "Tomorrow";
  return null;
}

/** A date for a card: "Today", "Tomorrow", or the date in `fmt`. */
export function dayText(date: Date, todayYmd: string, fmt = "EEE, MMM d"): string {
  return relativeDay(date, todayYmd) ?? formatLocal(date, fmt);
}
