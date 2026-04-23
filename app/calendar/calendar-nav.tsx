"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, addMonths, addYears, formatISO } from "date-fns";
import { formatLocal, parseHMInLocal, toLocalYmd } from "@/lib/time";

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

function positionLabel(view: View, viewYmd: string, isCurrent: boolean): string {
  if (isCurrent) {
    if (view === "day") return "Today";
    if (view === "month") return "This month";
    return "This year";
  }
  if (view === "year") return viewYmd.slice(0, 4);
  const noon = parseHMInLocal(viewYmd, "12:00");
  return view === "day"
    ? formatLocal(noon, "MMM d")
    : formatLocal(noon, "MMM yyyy");
}

export function CalendarNav({ view, date }: { view: View; date: Date }) {
  const router = useRouter();
  const params = useSearchParams();

  const viewYmd = useMemo(() => toLocalYmd(date), [date]);
  const isCurrent = useMemo(() => matchesNow(viewYmd, view), [viewYmd, view]);
  const buttonLabel = useMemo(
    () => positionLabel(view, viewYmd, isCurrent),
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
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-1">
        <button
          onClick={() => go(stepDate(date, view, -1), view)}
          aria-label="Previous"
          className="p-2 rounded-full text-ink/70 hover:text-ink hover:bg-ink/5 transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          onClick={() => go(new Date(), view)}
          disabled={isCurrent}
          className="px-4 py-1.5 rounded-full border border-ink/15 text-sm font-medium tabular-nums hover:bg-ink/5 transition-colors disabled:cursor-default disabled:hover:bg-transparent"
        >
          {buttonLabel}
        </button>
        <button
          onClick={() => go(stepDate(date, view, 1), view)}
          aria-label="Next"
          className="p-2 rounded-full text-ink/70 hover:text-ink hover:bg-ink/5 transition-colors"
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="flex items-center rounded-full border border-ink/15 overflow-hidden text-sm">
        {(["day", "month", "year"] as const).map((v) => (
          <button
            key={v}
            onClick={() => go(date, v)}
            className={`px-4 py-1.5 capitalize transition-colors ${
              v === view ? "bg-ink text-paper" : "text-ink/70 hover:text-ink hover:bg-ink/5"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}
