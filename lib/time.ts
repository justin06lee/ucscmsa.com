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
  return out;
}

export { toZonedTime };
