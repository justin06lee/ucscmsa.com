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
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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
    setOpen(false);
    triggerRef.current?.focus();
  }

  function clear() {
    if (!isControlled) setInternal("");
    onChange?.("");
  }

  function openPanel() {
    setCursor(selected ?? new Date());
    setOpen(true);
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
            <span className="text-sm font-medium">{format(cursor, "MMMM yyyy")}</span>
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
          <div className="grid grid-cols-7 gap-1">
            {days.map((d) => {
              const inMonth = isSameMonth(d, cursor);
              const isSel = selected ? isSameDay(d, selected) : false;
              const isToday = isSameDay(d, today);
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => commit(d)}
                  data-selected={isSel ? "true" : "false"}
                  data-today={isToday ? "true" : "false"}
                  className={`aspect-square rounded-md text-sm transition-colors ${
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
