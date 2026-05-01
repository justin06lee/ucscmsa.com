"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Clock } from "lucide-react";

type Props = {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  className?: string;
  id?: string;
  ariaLabel?: string;
  step?: number;
};

type TimeParts = { h12: number; minute: number; period: "AM" | "PM" };

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);

function to24h(h12: number, period: "AM" | "PM"): number {
  if (period === "AM") return h12 === 12 ? 0 : h12;
  return h12 === 12 ? 12 : h12 + 12;
}

function from24h(h24: number): { h12: number; period: "AM" | "PM" } {
  if (h24 === 0) return { h12: 12, period: "AM" };
  if (h24 < 12) return { h12: h24, period: "AM" };
  if (h24 === 12) return { h12: 12, period: "PM" };
  return { h12: h24 - 12, period: "PM" };
}

function parseHmm(v: string): TimeParts | null {
  if (!v) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m) return null;
  const h24 = Number(m[1]);
  const minute = Number(m[2]);
  if (h24 < 0 || h24 > 23 || minute < 0 || minute > 59) return null;
  return { ...from24h(h24), minute };
}

function parseTyped(raw: string): TimeParts | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  const m = /^(\d{1,2})(?:[:.\s](\d{1,2}))?\s*(am|pm|a|p)?$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  if (Number.isNaN(h) || Number.isNaN(minute)) return null;
  if (minute < 0 || minute > 59) return null;

  const periodRaw = m[3];
  let period: "AM" | "PM" | null = null;
  if (periodRaw === "am" || periodRaw === "a") period = "AM";
  else if (periodRaw === "pm" || periodRaw === "p") period = "PM";

  if (period === null) {
    if (h < 0 || h > 23) return null;
    const f = from24h(h);
    return { h12: f.h12, minute, period: f.period };
  }
  if (h < 1 || h > 12) return null;
  return { h12: h, minute, period };
}

function fmt24(p: TimeParts): string {
  return `${String(to24h(p.h12, p.period)).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

function fmt12(p: TimeParts): string {
  return `${p.h12}:${String(p.minute).padStart(2, "0")} ${p.period}`;
}

export function TimePicker({
  name,
  value,
  defaultValue,
  onChange,
  required,
  className = "",
  id,
  ariaLabel,
  step = 5,
}: Props) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValue ?? "");
  const current = isControlled ? value! : internal;
  const parsed = useMemo(() => parseHmm(current), [current]);
  const display = parsed ? fmt12(parsed) : "";

  const [text, setText] = useState(display);
  useEffect(() => {
    setText(display);
  }, [display]);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<TimeParts>(
    () => parsed ?? { h12: 9, minute: 0, period: "AM" },
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hourColRef = useRef<HTMLDivElement>(null);
  const [autofocusHour, setAutofocusHour] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Move focus into the hour column's active option when the dialog opens.
  useEffect(() => {
    if (!open) {
      setAutofocusHour(false);
      return;
    }
    setAutofocusHour(true);
    // Defer to ensure Column has rendered and the active button exists.
    const id = requestAnimationFrame(() => {
      const el = hourColRef.current?.querySelector<HTMLButtonElement>(
        "[data-active=true]",
      );
      el?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  const minutes = useMemo(
    () => Array.from({ length: 60 / step }, (_, i) => i * step),
    [step],
  );

  function commit(p: TimeParts) {
    const v = fmt24(p);
    if (!isControlled) setInternal(v);
    onChange?.(v);
    setDraft(p);
  }

  function commitTyped() {
    const p = parseTyped(text);
    if (p) commit(p);
    else setText(display);
  }

  function openPanel() {
    setDraft(parsed ?? { h12: 9, minute: 0, period: "AM" });
    setOpen(true);
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
      <div className="flex items-stretch rounded-md border border-ink/20 bg-paper transition-colors hover:border-ink/40 focus-within:border-ink">
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="text"
          autoComplete="off"
          aria-label={ariaLabel}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitTyped}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitTyped();
            }
          }}
          placeholder="Select time"
          className="w-full min-w-0 flex-1 bg-transparent px-3 py-2 placeholder:text-dim/70 focus:outline-none"
        />
        <button
          type="button"
          aria-label="Open time picker"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => (open ? setOpen(false) : openPanel())}
          className="flex items-center px-3 text-dim transition-colors hover:text-ink"
        >
          <Clock size={16} />
        </button>
      </div>
      {open && (
        <div
          role="dialog"
          className="absolute left-0 top-full z-30 mt-1 flex w-[260px] gap-2 rounded-md border border-ink/15 bg-paper p-2 shadow-md"
        >
          <Column
            ref={hourColRef}
            label="Hour"
            items={HOURS_12.map((h) => ({ value: h, label: String(h) }))}
            value={draft.h12}
            onSelect={(v) => commit({ ...draft, h12: v })}
            autofocus={autofocusHour}
          />
          <Column
            label="Min"
            items={minutes.map((m) => ({
              value: m,
              label: String(m).padStart(2, "0"),
            }))}
            value={Math.round(draft.minute / step) * step}
            onSelect={(v) => commit({ ...draft, minute: v })}
          />
          <Column
            label="AM/PM"
            items={[
              { value: "AM", label: "AM" },
              { value: "PM", label: "PM" },
            ]}
            value={draft.period}
            onSelect={(v) => commit({ ...draft, period: v })}
          />
        </div>
      )}
    </div>
  );
}

type ColumnProps<T extends string | number> = {
  label: string;
  items: Array<{ value: T; label: string }>;
  value: T;
  onSelect: (v: T) => void;
  autofocus?: boolean;
  ref?: React.Ref<HTMLDivElement>;
};

function Column<T extends string | number>({
  label,
  items,
  value,
  onSelect,
  autofocus,
  ref,
}: ColumnProps<T>) {
  const localRef = useRef<HTMLDivElement>(null);
  const setRef = (el: HTMLDivElement | null) => {
    localRef.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
  };

  // Track which item is the roving-tabindex target. Defaults to the active value.
  const activeIndex = Math.max(
    0,
    items.findIndex((it) => it.value === value),
  );
  const [focusIndex, setFocusIndex] = useState(activeIndex);

  // When the selected value changes (e.g., user clicks another column), keep
  // the roving target aligned with the active value.
  useEffect(() => {
    setFocusIndex(activeIndex);
  }, [activeIndex]);

  // Scroll the active item into view (preserves prior behavior).
  useEffect(() => {
    const el = localRef.current?.querySelector<HTMLButtonElement>(
      "[data-active=true]",
    );
    el?.scrollIntoView({ block: "center" });
  }, [value]);

  // When the column is told to autofocus, move focus to the active item.
  useEffect(() => {
    if (!autofocus) return;
    const el = localRef.current?.querySelector<HTMLButtonElement>(
      "[data-active=true]",
    );
    el?.focus();
  }, [autofocus]);

  function focusIndexAndScroll(next: number) {
    setFocusIndex(next);
    // Find the button by index attr and focus it.
    const buttons = localRef.current?.querySelectorAll<HTMLButtonElement>(
      "button[role=option]",
    );
    const btn = buttons?.[next];
    btn?.focus();
    btn?.scrollIntoView({ block: "nearest" });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const last = items.length - 1;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusIndexAndScroll(focusIndex >= last ? 0 : focusIndex + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusIndexAndScroll(focusIndex <= 0 ? last : focusIndex - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusIndexAndScroll(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusIndexAndScroll(last);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const it = items[focusIndex];
      if (it) onSelect(it.value);
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <span className="px-2 pb-1 text-[10px] uppercase tracking-wide text-dim">
        {label}
      </span>
      <div
        ref={setRef}
        role="listbox"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex max-h-48 flex-col overflow-y-auto rounded-md border border-ink/10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((it, i) => {
          const active = it.value === value;
          const isFocusTarget = i === focusIndex;
          return (
            <button
              key={String(it.value)}
              type="button"
              role="option"
              aria-selected={active}
              data-active={active ? "true" : "false"}
              tabIndex={isFocusTarget ? 0 : -1}
              onClick={() => onSelect(it.value)}
              onFocus={() => setFocusIndex(i)}
              className={`px-3 py-1.5 text-center text-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ink/40 ${
                active ? "bg-ink text-paper" : "text-ink/80 hover:bg-ink/5"
              }`}
            >
              {it.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
