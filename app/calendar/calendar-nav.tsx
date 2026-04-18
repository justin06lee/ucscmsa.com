"use client";

import { useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, addMonths, addYears, formatISO } from "date-fns";

type View = "day" | "month" | "year";

function stepDate(date: Date, view: View, delta: 1 | -1): Date {
  if (view === "day") return addDays(date, delta);
  if (view === "month") return addMonths(date, delta);
  return addYears(date, delta);
}

export function CalendarNav({ view, date }: { view: View; date: Date }) {
  const router = useRouter();
  const params = useSearchParams();

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
    <div className="flex items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-2">
        <button
          onClick={() => go(stepDate(date, view, -1), view)}
          aria-label="Previous"
          className="p-2 rounded-full hover:bg-ink/5"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          onClick={() => go(new Date(), view)}
          className="px-3 py-1 rounded-full border border-ink/20 hover:bg-ink/5"
        >
          Today
        </button>
        <button
          onClick={() => go(stepDate(date, view, 1), view)}
          aria-label="Next"
          className="p-2 rounded-full hover:bg-ink/5"
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="flex items-center rounded-full border border-ink/20 overflow-hidden">
        {(["day", "month", "year"] as const).map((v) => (
          <button
            key={v}
            onClick={() => go(date, v)}
            className={`px-4 py-1 capitalize ${
              v === view ? "bg-ink text-paper" : "hover:bg-ink/5"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}
