"use client";

import { useCallback, useEffect, useMemo, useOptimistic, useRef, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, addMonths, addYears, formatISO } from "date-fns";
import { formatLocal, parseHMInLocal, schoolYearLabel, schoolYearOf, toLocalYmd } from "@/lib/time";
import { Button } from "@/components/ui/button";

type View = "day" | "month" | "year";

function stepDate(date: Date, view: View, delta: 1 | -1): Date {
  if (view === "day") return addDays(date, delta);
  if (view === "month") return addMonths(date, delta);
  return addYears(date, delta);
}

function matchesNow(viewYmd: string, view: View): boolean {
  const now = toLocalYmd(new Date());
  if (view === "day") return viewYmd === now;
  if (view === "month") return viewYmd.slice(0, 7) === now.slice(0, 7);
  return schoolYearOf(viewYmd) === schoolYearOf(now);
}

function titleLabel(view: View, viewYmd: string, isCurrent: boolean): string {
  if (isCurrent) {
    if (view === "day") return "Today";
    if (view === "month") return "This month";
    return "This school year";
  }
  if (view === "year") return `${schoolYearLabel(schoolYearOf(viewYmd))} school year`;
  const noon = parseHMInLocal(viewYmd, "12:00");
  return view === "day"
    ? formatLocal(noon, "EEEE, MMMM d, yyyy")
    : formatLocal(noon, "MMMM yyyy");
}

// Phones: the long day title ("Wednesday, September 30, 2026") wraps at
// text-3xl, so day view abbreviates below sm.
function shortTitleLabel(view: View, viewYmd: string, isCurrent: boolean): string | null {
  if (isCurrent || view !== "day") return null;
  return formatLocal(parseHMInLocal(viewYmd, "12:00"), "EEE, MMM d, yyyy");
}

function subtitleLabel(view: View, viewYmd: string, isCurrent: boolean): string | null {
  if (!isCurrent) return null;
  const noon = parseHMInLocal(viewYmd, "12:00");
  if (view === "day") return formatLocal(noon, "EEEE, MMMM d");
  if (view === "month") return formatLocal(noon, "MMMM yyyy");
  return schoolYearLabel(schoolYearOf(viewYmd));
}

const VIEWS = ["day", "month", "year"] as const;

export function CalendarNav({ view, date }: { view: View; date: Date }) {
  const router = useRouter();
  const params = useSearchParams();
  const toolbarRef = useRef<HTMLElement>(null);

  const viewYmd = useMemo(() => toLocalYmd(date), [date]);
  const isCurrent = useMemo(() => matchesNow(viewYmd, view), [viewYmd, view]);
  const title = useMemo(
    () => titleLabel(view, viewYmd, isCurrent),
    [view, viewYmd, isCurrent]
  );
  const shortTitle = useMemo(
    () => shortTitleLabel(view, viewYmd, isCurrent),
    [view, viewYmd, isCurrent]
  );
  const subtitle = useMemo(
    () => subtitleLabel(view, viewYmd, isCurrent),
    [view, viewYmd, isCurrent]
  );

  // The view being left stays up, dimmed (data-pending; see page.tsx), until
  // the next one arrives: the click shows at once without a blank skeleton.
  const [pending, startTransition] = useTransition();
  // The switch's pill slides to the view picked at once, not when it arrives.
  const [shownView, setShownView] = useOptimistic(view);
  const go = useCallback(
    (next: Date, nextView: View) => {
      const p = new URLSearchParams(params);
      p.set("view", nextView);
      p.set("date", formatISO(next, { representation: "date" }));
      startTransition(() => {
        setShownView(nextView);
        router.push(`/calendar?${p.toString()}`);
      });
    },
    [params, router, setShownView]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") go(stepDate(date, view, -1), view);
      if (e.key === "ArrowRight") go(stepDate(date, view, 1), view);
      // Single-letter shortcuts only while focus is in this toolbar (WCAG
      // 2.1.4): page-wide, they fire on speech-input and stray keystrokes.
      if (!toolbarRef.current?.contains(document.activeElement)) return;
      if (e.key.toLowerCase() === "t") go(new Date(), view);
      if (e.key.toLowerCase() === "d") go(date, "day");
      if (e.key.toLowerCase() === "m") go(date, "month");
      if (e.key.toLowerCase() === "y") go(date, "year");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, date, go]);

  return (
    <header
      ref={toolbarRef}
      data-pending={pending ? "" : undefined}
      aria-busy={pending}
      className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3"
    >
      <div className="flex w-full min-w-0 items-center gap-1 sm:w-auto sm:gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => go(stepDate(date, view, -1), view)}
          aria-label={`Previous ${view}`}
          className="-ml-2 !h-11 !w-11 shrink-0 !rounded-full !p-0"
        >
          <ChevronLeft size={22} aria-hidden="true" />
        </Button>
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1 sm:flex-none">
          <h1 className="text-3xl leading-none sm:text-4xl">
            {shortTitle ? (
              <>
                <span className="sm:hidden">{shortTitle}</span>
                <span className="hidden sm:inline">{title}</span>
              </>
            ) : (
              title
            )}
          </h1>
          {subtitle ? (
            <span className="text-sm text-dim">{subtitle}</span>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => go(stepDate(date, view, 1), view)}
          aria-label={`Next ${view}`}
          className="!h-11 !w-11 shrink-0 !rounded-full !p-0"
        >
          <ChevronRight size={22} aria-hidden="true" />
        </Button>
      </div>
      {/* A segmented switch: one pill, under the view shown, slides between
          the three (transform only; still for reduced motion). */}
      <div
        role="tablist"
        aria-label="Calendar view"
        className="relative grid w-full grid-cols-3 rounded-full bg-ink/[0.06] p-1 text-sm sm:w-auto"
      >
        <span
          aria-hidden="true"
          data-view-pill=""
          className="pointer-events-none absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-full bg-paper shadow-[0_1px_3px_rgb(21_19_18/0.12),0_0_0_1px_rgb(21_19_18/0.06)] transition-transform duration-300 ease-[cubic-bezier(0.3,0.7,0.2,1)] motion-reduce:transition-none"
          style={{ transform: `translateX(${VIEWS.indexOf(shownView) * 100}%)` }}
        />
        {VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={v === shownView}
            onClick={() => go(date, v)}
            className={`relative min-h-11 rounded-full px-5 capitalize transition-colors duration-200 ${
              v === shownView ? "font-medium text-ink" : "text-ink/60 hover:text-ink"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
    </header>
  );
}
