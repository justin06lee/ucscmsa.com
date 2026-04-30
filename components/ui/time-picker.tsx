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
            label="Hour"
            items={HOURS_12.map((h) => ({ value: h, label: String(h) }))}
            value={draft.h12}
            onSelect={(v) => commit({ ...draft, h12: v })}
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

function Column<T extends string | number>({
  label,
  items,
  value,
  onSelect,
}: {
  label: string;
  items: Array<{ value: T; label: string }>;
  value: T;
  onSelect: (v: T) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLButtonElement>("[data-active=true]");
    el?.scrollIntoView({ block: "center" });
  }, [value]);
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <span className="px-2 pb-1 text-[10px] uppercase tracking-wide text-dim">
        {label}
      </span>
      <div
        ref={ref}
        className="flex max-h-48 flex-col overflow-y-auto rounded-md border border-ink/10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((it) => {
          const active = it.value === value;
          return (
            <button
              key={String(it.value)}
              type="button"
              data-active={active ? "true" : "false"}
              onClick={() => onSelect(it.value)}
              className={`px-3 py-1.5 text-center text-sm transition-colors ${
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
