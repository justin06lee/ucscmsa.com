"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export type SelectOption = { value: string; label: string };

type Props = {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
};

export function Select({
  name,
  value,
  defaultValue,
  onChange,
  options,
  placeholder = "Select…",
  className = "",
  disabled,
  id,
  ariaLabel,
}: Props) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValue ?? "");
  const current = isControlled ? value : internal;
  const selected = options.find((o) => o.value === current);

  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const listId = `${triggerId}-list`;

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  function commit(v: string) {
    if (!isControlled) setInternal(v);
    onChange?.(v);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function openMenu() {
    if (disabled) return;
    const idx = options.findIndex((opt) => opt.value === current);
    setHighlight(idx >= 0 ? idx : 0);
    setOpen(true);
  }

  function onTriggerKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openMenu();
    }
  }

  function onListKey(e: React.KeyboardEvent<HTMLUListElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + options.length) % options.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = options[highlight];
      if (opt) commit(opt.value);
    } else if (e.key === "Home") {
      e.preventDefault();
      setHighlight(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setHighlight(options.length - 1);
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {name ? <input type="hidden" name={name} value={current} /> : null}
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onTriggerKey}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-ink/20 bg-paper px-3 py-2 text-left transition-colors hover:border-ink/40 focus:border-ink focus:outline-none disabled:pointer-events-none disabled:opacity-50"
      >
        <span className={selected ? "" : "text-dim"}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-dim transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          tabIndex={-1}
          autoFocus
          aria-activedescendant={`${triggerId}-opt-${highlight}`}
          onKeyDown={onListKey}
          ref={(el) => {
            el?.focus();
          }}
          className="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-auto rounded-md border border-ink/15 bg-paper shadow-md focus:outline-none"
        >
          {options.map((opt, i) => (
            <li
              key={opt.value}
              id={`${triggerId}-opt-${i}`}
              role="option"
              aria-selected={opt.value === current}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(opt.value);
              }}
              className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm transition-colors ${
                i === highlight ? "bg-ink/5" : ""
              } ${opt.value === current ? "text-ink" : "text-ink/80"}`}
            >
              <span>{opt.label}</span>
              {opt.value === current ? <Check size={14} /> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
