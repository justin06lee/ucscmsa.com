"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, addMonths, addYears, formatISO } from "date-fns";
import { formatLocal, parseHMInLocal, toLocalYmd } from "@/lib/time";
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
  return viewYmd.slice(0, 4) === now.slice(0, 4);
}

function titleLabel(view: View, viewYmd: string, isCurrent: boolean): string {
  if (isCurrent) {
    if (view === "day") return "Today";
    if (view === "month") return "This month";
    return "This year";
  }
  if (view === "year") return viewYmd.slice(0, 4);
  const noon = parseHMInLocal(viewYmd, "12:00");
  return view === "day"
    ? formatLocal(noon, "EEEE, MMMM d, yyyy")
    : formatLocal(noon, "MMMM yyyy");
}

function subtitleLabel(view: View, viewYmd: string, isCurrent: boolean): string | null {
  if (!isCurrent) return null;
  const noon = parseHMInLocal(viewYmd, "12:00");
  if (view === "day") return formatLocal(noon, "EEEE, MMMM d");
  if (view === "month") return formatLocal(noon, "MMMM yyyy");
  return viewYmd.slice(0, 4);
}

export function CalendarNav({ view, date }: { view: View; date: Date }) {
  const router = useRouter();
  const params = useSearchParams();

  const viewYmd = useMemo(() => toLocalYmd(date), [date]);
  const isCurrent = useMemo(() => matchesNow(viewYmd, view), [viewYmd, view]);
  const title = useMemo(
    () => titleLabel(view, viewYmd, isCurrent),
    [view, viewYmd, isCurrent]
  );
  const subtitle = useMemo(
    () => subtitleLabel(view, viewYmd, isCurrent),
    [view, viewYmd, isCurrent]
  );

  const go = useCallback(
    (next: Date, nextView: View) => {
      const p = new URLSearchParams(params);
      p.set("view", nextView);
      p.set("date", formatISO(next, { representation: "date" }));
      router.push(`/calendar?${p.toString()}`);
    },
    [params, router]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") go(stepDate(date, view, -1), view);
      if (e.key === "ArrowRight") go(stepDate(date, view, 1), view);
      if (e.key.toLowerCase() === "t") go(new Date(), view);
      if (e.key.toLowerCase() === "d") go(date, "day");
      if (e.key.toLowerCase() === "m") go(date, "month");
      if (e.key.toLowerCase() === "y") go(date, "year");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, date, go]);

  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => go(stepDate(date, view, -1), view)}
          aria-label="Previous"
          className="-ml-2 !rounded-full !px-2 !py-2"
        >
          <ChevronLeft size={22} />
        </Button>
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-4xl leading-none">{title}</h1>
          {subtitle ? (
            <span className="text-sm text-dim">{subtitle}</span>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => go(stepDate(date, view, 1), view)}
          aria-label="Next"
          className="!rounded-full !px-2 !py-2"
        >
          <ChevronRight size={22} />
        </Button>
      </div>
      <div
        role="tablist"
        className="flex items-center overflow-hidden rounded-full border border-ink/15 text-sm"
      >
        {(["day", "month", "year"] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={v === view}
            onClick={() => go(date, v)}
            className={`px-4 py-1.5 capitalize transition-colors ${
              v === view ? "bg-ink text-paper" : "text-ink/70 hover:bg-ink/5 hover:text-ink"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
    </header>
  );
}
