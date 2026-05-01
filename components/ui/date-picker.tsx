"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isSameDay,
  isSameMonth,
  parse,
  startOfMonth,
  startOfWeek,
} from "date-fns";

type Props = {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  id?: string;
  ariaLabel?: string;
};

const FMT = "yyyy-MM-dd";
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseYmd(v: string): Date | null {
  if (!v) return null;
  const d = parse(v, FMT, new Date());
  return Number.isNaN(d.getTime()) ? null : d;
}

export function DatePicker({
  name,
  value,
  defaultValue,
  onChange,
  placeholder = "Select date",
  required,
  className = "",
  id,
  ariaLabel,
}: Props) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValue ?? "");
  const current = isControlled ? value! : internal;
  const selected = useMemo(() => parseYmd(current), [current]);

  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState<Date>(() => selected ?? new Date());
  // Day arrow keys move and Enter commits this date. Independent of `selected`.
  const [focusedDate, setFocusedDate] = useState<Date>(
    () => selected ?? new Date(),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  // Bumped each time we want the day-grid to (re)take focus on the focused day,
  // e.g. after PageUp/PageDown re-renders the grid.
  const [focusTick, setFocusTick] = useState(0);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function commit(d: Date) {
    const v = format(d, FMT);
    if (!isControlled) setInternal(v);
    onChange?.(v);
    setCursor(d);
    setFocusedDate(d);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function clear() {
    if (!isControlled) setInternal("");
    onChange?.("");
  }

  function openPanel() {
    const initial = selected ?? new Date();
    setCursor(initial);
    setFocusedDate(initial);
    setOpen(true);
    setFocusTick((t) => t + 1);
  }

  const today = new Date();
  const monthStart = useMemo(() => startOfMonth(cursor), [cursor]);
  const monthEnd = useMemo(() => endOfMonth(cursor), [cursor]);
  const gridStart = useMemo(() => startOfWeek(monthStart, { weekStartsOn: 0 }), [monthStart]);
  const gridEnd = useMemo(() => endOfWeek(monthEnd, { weekStartsOn: 0 }), [monthEnd]);
  const days = useMemo(() => {
    const arr: Date[] = [];
    let d = gridStart;
    while (!isAfter(d, gridEnd)) {
      arr.push(d);
      d = addDays(d, 1);
    }
    return arr;
  }, [gridStart, gridEnd]);

  // After open or after PageUp/PageDown re-renders the grid, focus the
  // currently-focused day's button so the roving-tabindex pattern stays glued
  // to the keyboard cursor.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      const key = format(focusedDate, FMT);
      const el = gridRef.current?.querySelector<HTMLButtonElement>(
        `button[data-date="${key}"]`,
      );
      el?.focus();
    });
    return () => cancelAnimationFrame(id);
    // focusTick lets us re-run after page-month nav even if focusedDate
    // identity didn't change.
  }, [open, focusTick, focusedDate]);

  function moveFocus(next: Date) {
    setFocusedDate(next);
    if (!isSameMonth(next, cursor)) {
      setCursor(next);
      // Cursor change re-renders the grid; bump tick so effect refocuses.
      setFocusTick((t) => t + 1);
    }
  }

  function onGridKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        moveFocus(addDays(focusedDate, -1));
        break;
      case "ArrowRight":
        e.preventDefault();
        moveFocus(addDays(focusedDate, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        moveFocus(addDays(focusedDate, -7));
        break;
      case "ArrowDown":
        e.preventDefault();
        moveFocus(addDays(focusedDate, 7));
        break;
      case "Home":
        e.preventDefault();
        moveFocus(startOfWeek(focusedDate, { weekStartsOn: 0 }));
        break;
      case "End":
        e.preventDefault();
        moveFocus(endOfWeek(focusedDate, { weekStartsOn: 0 }));
        break;
      case "PageUp":
        e.preventDefault();
        moveFocus(addMonths(focusedDate, -1));
        break;
      case "PageDown":
        e.preventDefault();
        moveFocus(addMonths(focusedDate, 1));
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        commit(focusedDate);
        break;
      default:
        break;
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <input
        type="hidden"
        name={name}
        value={current}
        required={required}
        onChange={() => {}}
      />
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openPanel())}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-ink/20 bg-paper px-3 py-2 text-left transition-colors hover:border-ink/40 focus:border-ink focus:outline-none"
      >
        <span className={selected ? "" : "text-dim"}>
          {selected ? format(selected, "EEE, MMM d, yyyy") : placeholder}
        </span>
        <CalendarIcon size={16} className="shrink-0 text-dim" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Choose date"
          className="absolute left-0 top-full z-30 mt-1 w-[300px] rounded-md border border-ink/15 bg-paper p-3 shadow-md"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setCursor((c) => addMonths(c, -1))}
              className="rounded-full p-1 text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-medium" aria-live="polite">
              {format(cursor, "MMMM yyyy")}
            </span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setCursor((c) => addMonths(c, 1))}
              className="rounded-full p-1 text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] uppercase tracking-wide text-dim">
            {DAY_LABELS.map((d) => (
              <span key={d} className="py-1">
                {d.slice(0, 1)}
              </span>
            ))}
          </div>
          <div
            ref={gridRef}
            role="grid"
            aria-label={format(cursor, "MMMM yyyy")}
            onKeyDown={onGridKeyDown}
            className="grid grid-cols-7 gap-1"
          >
            {days.map((d) => {
              const inMonth = isSameMonth(d, cursor);
              const isSel = selected ? isSameDay(d, selected) : false;
              const isToday = isSameDay(d, today);
              const isFocused = isSameDay(d, focusedDate);
              const dateKey = format(d, FMT);
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  role="gridcell"
                  data-date={dateKey}
                  data-selected={isSel ? "true" : "false"}
                  data-today={isToday ? "true" : "false"}
                  aria-label={format(d, "EEEE, MMMM d, yyyy")}
                  aria-selected={isSel}
                  aria-current={isToday ? "date" : undefined}
                  tabIndex={isFocused ? 0 : -1}
                  onClick={() => commit(d)}
                  onFocus={() => setFocusedDate(d)}
                  className={`aspect-square rounded-md text-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ink/40 ${
                    inMonth ? "text-ink" : "text-ink/30"
                  } hover:bg-ink/5 data-[selected=true]:bg-ink data-[selected=true]:text-paper data-[selected=true]:hover:bg-ink data-[today=true]:ring-1 data-[today=true]:ring-ink/40 data-[selected=true]:data-[today=true]:ring-0`}
                >
                  {format(d, "d")}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-ink/10 pt-2">
            <button
              type="button"
              onClick={() => commit(new Date())}
              className="rounded-md px-2 py-1 text-xs text-ink/70 transition-colors hover:bg-ink/5 hover:text-ink"
            >
              Today
            </button>
            {current ? (
              <button
                type="button"
                onClick={clear}
                className="rounded-md px-2 py-1 text-xs text-ink/70 transition-colors hover:bg-ink/5 hover:text-ink"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
