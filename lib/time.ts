import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

export const SITE_TZ = "America/Los_Angeles" as const;

export function toLocalYmd(utc: Date): string {
  return formatInTimeZone(utc, SITE_TZ, "yyyy-MM-dd");
}

export function parseHMInLocal(ymd: string, hm: string): Date {
  return fromZonedTime(`${ymd}T${hm}:00`, SITE_TZ);
}

export function floorLocalHour(utc: Date): number {
  return Number(formatInTimeZone(utc, SITE_TZ, "H"));
}

export function ceilLocalHour(utc: Date): number {
  const parts = formatInTimeZone(utc, SITE_TZ, "H:m").split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  return m === 0 ? h : h + 1;
}

export function startOfLocalDayUtc(ymd: string): Date {
  return fromZonedTime(`${ymd}T00:00:00.000`, SITE_TZ);
}

export function endOfLocalDayUtc(ymd: string): Date {
  return fromZonedTime(`${ymd}T23:59:59.999`, SITE_TZ);
}

export function startOfLocalMonthUtc(ymd: string): Date {
  const [y, m] = ymd.split("-");
  return fromZonedTime(`${y}-${m}-01T00:00:00.000`, SITE_TZ);
}

export function endOfLocalMonthUtc(ymd: string): Date {
  const [y, m] = ymd.split("-").map(Number);
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? y + 1 : y;
  const mm = String(nextMonth).padStart(2, "0");
  const next = fromZonedTime(`${nextYear}-${mm}-01T00:00:00.000`, SITE_TZ);
  return new Date(next.getTime() - 1);
}

export function startOfLocalYearUtc(ymd: string): Date {
  const [y] = ymd.split("-");
  return fromZonedTime(`${y}-01-01T00:00:00.000`, SITE_TZ);
}

export function endOfLocalYearUtc(ymd: string): Date {
  const [y] = ymd.split("-").map(Number);
  const next = fromZonedTime(`${y + 1}-01-01T00:00:00.000`, SITE_TZ);
  return new Date(next.getTime() - 1);
}

// The school year runs September through June (summer is off). July and
// August already belong to the year about to start: its events are planned
// and posted then. The year view shows these ten months.

/** The calendar year a school year starts in: 2026 for 2026-27. */
export function schoolYearOf(ymd: string): number {
  const [y, m] = ymd.split("-").map(Number);
  return m >= 7 ? y : y - 1;
}

/** "2026–27" */
export function schoolYearLabel(startYear: number): string {
  return `${startYear}–${String(startYear + 1).slice(2)}`;
}

/** The ten months of a school year, September to June, as yyyy-MM-01. */
export function schoolYearMonths(startYear: number): string[] {
  return Array.from({ length: 10 }, (_, i) => {
    const m = ((8 + i) % 12) + 1;
    const y = m >= 9 ? startYear : startYear + 1;
    return `${y}-${String(m).padStart(2, "0")}-01`;
  });
}

export function startOfSchoolYearUtc(ymd: string): Date {
  return fromZonedTime(`${schoolYearOf(ymd)}-09-01T00:00:00.000`, SITE_TZ);
}

export function endOfSchoolYearUtc(ymd: string): Date {
  const next = fromZonedTime(`${schoolYearOf(ymd) + 1}-07-01T00:00:00.000`, SITE_TZ);
  return new Date(next.getTime() - 1);
}

export function localHourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

export function formatLocal(utc: Date, fmt: string): string {
  return formatInTimeZone(utc, SITE_TZ, fmt);
}

export function monthGridDays(ymd: string): Array<{ ymd: string; inMonth: boolean }> {
  const [y, m] = ymd.split("-").map(Number);
  // JS Date used purely as calendar arithmetic: ymd components are SITE_TZ-local dates
  // and we walk them numerically. No TZ conversion needed.
  const first = new Date(Date.UTC(y, m - 1, 1));
  const dayOfWeek = first.getUTCDay(); // Sunday=0
  const gridStart = new Date(Date.UTC(y, m - 1, 1 - dayOfWeek));
  const out: Array<{ ymd: string; inMonth: boolean }> = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setUTCDate(d.getUTCDate() + i);
    const yy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    out.push({ ymd: `${yy}-${mm}-${dd}`, inMonth: d.getUTCMonth() === m - 1 });
  }
  while (out.length > 7 && out.slice(-7).every((c) => !c.inMonth)) {
    out.splice(-7);
  }
  return out;
}

export { toZonedTime };
