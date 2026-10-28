import { IntentLink } from "@/components/intent-link";
import type { Occurrence } from "@/lib/rrule-lite";
import { formatLocal, parseHMInLocal, schoolYearMonths, schoolYearOf, toLocalYmd } from "@/lib/time";
import { FadeIn } from "@/components/fade-in";

type Props = { ymd: string; occurrences: Occurrence[] };

const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

type MonthLayout = {
  monthName: string;
  year: number;
  firstYmd: string;
  offset: number;
  days: string[];
};

function buildMonth(year: number, monthIndex: number): MonthLayout {
  const mm = String(monthIndex + 1).padStart(2, "0");
  const firstYmd = `${year}-${mm}-01`;
  const firstDate = parseHMInLocal(firstYmd, "12:00");
  const monthName = formatLocal(firstDate, "MMMM");
  const offset = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const days: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dd = String(d).padStart(2, "0");
    days.push(`${year}-${mm}-${dd}`);
  }
  return { monthName, year, firstYmd, offset, days };
}

function intensityClass(count: number): string {
  if (count === 0) return "bg-ink/[0.06]";
  if (count === 1) return "bg-burgundy/25";
  if (count === 2) return "bg-burgundy/50";
  if (count === 3) return "bg-burgundy/75";
  return "bg-burgundy";
}

/**
 * The school year at a glance, September to June (see schoolYearOf): each
 * month a small grid shaded by how many events each day has, the month we
 * are in marked.
 */
export function YearView({ ymd, occurrences }: Props) {
  const todayYmd = toLocalYmd(new Date());
  const thisMonth = todayYmd.slice(0, 7);

  const countByDay = new Map<string, number>();
  for (const o of occurrences) {
    const key = toLocalYmd(o.occurrenceStart);
    countByDay.set(key, (countByDay.get(key) ?? 0) + 1);
  }

  const months = schoolYearMonths(schoolYearOf(ymd)).map((first) => {
    const [y, m] = first.split("-").map(Number);
    return buildMonth(y, m - 1);
  });

  return (
    <FadeIn>
      {/* Phones: day squares would be ~19px, under the 24px minimum tap
          target, so each month is one target that opens the month view. */}
      <ul className="grid grid-cols-2 gap-3 sm:hidden">
        {months.map(({ monthName, year, firstYmd, offset, days }) => {
          const total = days.reduce((n, d) => n + (countByDay.get(d) ?? 0), 0);
          const current = firstYmd.slice(0, 7) === thisMonth;
          return (
            <li key={firstYmd}>
              <IntentLink
                href={`/calendar?view=month&date=${firstYmd}`}
                aria-label={`${monthName} ${year}${current ? " (this month)" : ""}, ${total === 0 ? "no events" : `${total} event${total === 1 ? "" : "s"}`}`}
                aria-current={current ? "date" : undefined}
                className={`block rounded-xl border p-2.5 transition-colors ${
                  current
                    ? "border-burgundy bg-burgundy-soft/25 ring-1 ring-burgundy"
                    : "border-ink/10 bg-paper hover:border-ink/25"
                }`}
              >
                <span className={`flex items-baseline justify-between text-sm font-medium ${current ? "text-burgundy" : ""}`}>
                  {monthName}
                  {total > 0 ? <span className="text-xs tabular-nums text-dim">{total}</span> : null}
                </span>
                <span aria-hidden="true" className="mt-2 grid grid-cols-7 gap-0.5">
                  {Array.from({ length: offset }, (_, i) => (
                    <span key={`off-${i}`} className="aspect-square" />
                  ))}
                  {days.map((dayYmd) => (
                    <span
                      key={dayYmd}
                      className={`aspect-square rounded-[3px] ${intensityClass(countByDay.get(dayYmd) ?? 0)} ${
                        dayYmd === todayYmd ? "ring-1 ring-burgundy ring-offset-1 ring-offset-paper" : ""
                      }`}
                    />
                  ))}
                </span>
              </IntentLink>
            </li>
          );
        })}
      </ul>
      {/* Five across from lg: fall (Sep to Jan) over spring (Feb to Jun). */}
      <div className="hidden gap-6 sm:grid sm:grid-cols-2 lg:grid-cols-5 lg:gap-4">
        {months.map(({ monthName, year, firstYmd, offset, days }) => {
          const totalCells = offset + days.length;
          const trailing = (7 - (totalCells % 7)) % 7;
          const current = firstYmd.slice(0, 7) === thisMonth;
          return (
            <div
              key={firstYmd}
              data-current-month={current ? "" : undefined}
              className={`rounded-xl border px-4 py-3 lg:px-3 ${
                current ? "border-burgundy bg-burgundy-soft/20 ring-1 ring-burgundy" : "border-ink/10 bg-paper"
              }`}
            >
              <IntentLink
                href={`/calendar?view=month&date=${firstYmd}`}
                aria-current={current ? "date" : undefined}
                className={`flex min-h-11 w-full items-center justify-between gap-2 text-sm font-medium transition-colors hover:text-burgundy ${
                  current ? "text-burgundy" : ""
                }`}
              >
                <span>
                  {monthName}
                  {firstYmd.endsWith("-01-01") || firstYmd.endsWith("-09-01") ? (
                    <span className="ml-1.5 font-normal tabular-nums text-dim">{year}</span>
                  ) : null}
                </span>
                {current ? (
                  <span className="rounded-full bg-burgundy px-2 py-0.5 text-[11px] font-medium text-paper">Now</span>
                ) : null}
              </IntentLink>
              <div className="grid grid-cols-7 gap-1 text-[10px] text-dim uppercase tracking-wider lg:gap-[3px]">
                {WEEKDAY_INITIALS.map((d, i) => (
                  <div key={i} className="flex h-5 items-center justify-center">
                    {d}
                  </div>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1 lg:gap-[3px]">
                {Array.from({ length: offset }, (_, i) => (
                  <span key={`off-${i}`} className="size-7 lg:size-[19px] xl:size-[23px]" aria-hidden="true" />
                ))}
                {days.map((dayYmd) => {
                  const count = countByDay.get(dayYmd) ?? 0;
                  const s = count === 1 ? "" : "s";
                  const isToday = dayYmd === todayYmd;
                  return (
                    <IntentLink
                      key={dayYmd}
                      href={`/calendar?view=day&date=${dayYmd}`}
                      title={`${dayYmd}: ${count} event${s}`}
                      aria-label={`${formatLocal(parseHMInLocal(dayYmd, "12:00"), "EEEE, MMMM d")}, ${
                        count === 0 ? "no events" : `${count} event${s}`
                      }`}
                      data-dense-target=""
                      className={`size-7 rounded-md transition-transform hover:scale-110 lg:size-[19px] lg:rounded-[5px] xl:size-[23px] ${intensityClass(count)} ${
                        isToday ? "ring-2 ring-burgundy ring-offset-2 ring-offset-paper" : ""
                      }`}
                    />
                  );
                })}
                {Array.from({ length: trailing }, (_, i) => (
                  <span key={`trail-${i}`} className="size-7 lg:size-[19px] xl:size-[23px]" aria-hidden="true" />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </FadeIn>
  );
}
