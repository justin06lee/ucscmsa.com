"use client";

import { MoreHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export type RowMenuItem = { label: string; onSelect: () => void; danger?: boolean };

/**
 * The "…" menu on an admin row: a 44px button that opens a short list. Enter,
 * Space or the arrow keys open it; arrows, Home and End move; Esc closes and
 * hands focus back; a click or tap outside closes it. It flips upward when
 * there's no room below, so it never gets cut off at the bottom of a phone.
 */
export function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  function show(focus: "first" | "last" = "first") {
    const r = trigger.current?.getBoundingClientRect();
    setUp(!!r && window.innerHeight - r.bottom < items.length * 48 + 16);
    setOpen(true);
    requestAnimationFrame(() => {
      const els = root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
      (focus === "first" ? els?.[0] : els?.[els.length - 1])?.focus();
    });
  }
  function close(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  function move(e: React.KeyboardEvent, step: number | "first" | "last"): void {
    const els = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = els.indexOf(document.activeElement as HTMLElement);
    const next = step === "first" ? 0 : step === "last" ? els.length - 1 : (at + step + els.length) % els.length;
    e.preventDefault();
    els[next]?.focus();
  }

  return (
    <span
      ref={root}
      className="relative inline-flex"
      onKeyDown={(e) => {
        if (!open) return;
        if (e.key === "Escape") {
          e.preventDefault();
          close(true);
        } else if (e.key === "ArrowDown") move(e, 1);
        else if (e.key === "ArrowUp") move(e, -1);
        else if (e.key === "Home") move(e, "first");
        else if (e.key === "End") move(e, "last");
        else if (e.key === "Tab") setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        onClick={() => (open ? close(false) : show())}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            show(e.key === "ArrowUp" ? "last" : "first");
          }
        }}
        className="inline-flex size-11 items-center justify-center rounded-full text-ink/75 transition-colors hover:bg-ink/5 hover:text-ink aria-expanded:bg-ink/5"
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={`absolute right-0 z-20 min-w-44 max-w-[calc(100vw-2rem)] rounded-xl border border-ink/15 bg-paper p-1 shadow-lg ${up ? "bottom-full mb-1" : "top-full mt-1"}`}
        >
          {items.map((it): ReactNode => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                close(false);
                it.onSelect();
              }}
              className={`flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm transition-colors focus:outline-none focus-visible:bg-ink/10 ${it.danger ? "text-burgundy hover:bg-burgundy/5" : "text-ink/85 hover:bg-ink/5"}`}
            >
              {it.label}
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
}
