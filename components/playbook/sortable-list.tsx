"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

type Drag = {
  id: string;
  from: number;
  to: number;
  pointerId: number;
  startY: number; // page coordinates, so the page can scroll mid-drag
  tops: number[];
  heights: number[];
  gap: number;
};

/**
 * A list whose rows can be dragged by a handle (mouse, pen or touch). Each row
 * gets the handle to place where it likes; the handle also moves a row with the
 * up and down keys. Drops reorder at once and then call onMove with how many
 * places the row moved, so the page can save it.
 */
export function SortableList<T extends { id: string }>({
  items,
  as: Tag = "ul",
  className,
  disabled,
  onMove,
  children,
}: {
  items: T[];
  as?: "ul" | "ol";
  className?: string;
  disabled?: boolean;
  onMove: (id: string, by: number) => void;
  children: (item: T, index: number, handle: ReactNode) => ReactNode;
}) {
  const listRef = useRef<HTMLOListElement & HTMLUListElement>(null);
  const drag = useRef<Drag | null>(null);
  const [prev, setPrev] = useState(items);
  const [order, setOrder] = useState(items);
  if (items !== prev) {
    setPrev(items);
    setOrder(items);
  }

  const rows = () => Array.from(listRef.current?.children ?? []) as HTMLElement[];

  function move(id: string, by: number) {
    const from = order.findIndex((o) => o.id === id);
    const to = Math.max(0, Math.min(order.length - 1, from + by));
    if (from < 0 || to === from) return;
    const next = [...order];
    next.splice(to, 0, ...next.splice(from, 1));
    setOrder(next);
    onMove(id, to - from);
  }

  function reset() {
    for (const r of rows()) {
      r.style.transition = "none";
      r.style.transform = "";
      r.style.zIndex = "";
      r.style.position = "";
      r.style.background = "";
      r.style.boxShadow = "";
    }
  }

  function down(e: PointerEvent<HTMLButtonElement>, id: string) {
    if (disabled || e.button !== 0) return;
    const els = rows();
    const from = order.findIndex((o) => o.id === id);
    if (from < 0) return;
    const rects = els.map((r) => r.getBoundingClientRect());
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      id,
      from,
      to: from,
      pointerId: e.pointerId,
      startY: e.clientY + window.scrollY,
      tops: rects.map((r) => r.top + window.scrollY),
      heights: rects.map((r) => r.height),
      gap: rects.length > 1 ? rects[1].top - rects[0].bottom : 0,
    };
    els[from].style.zIndex = "10";
    els[from].style.position = "relative";
    els[from].style.background = "var(--color-paper)";
    els[from].style.boxShadow = "0 8px 24px rgb(0 0 0 / 0.12)";
    for (const [k, r] of els.entries()) r.style.transition = k === from ? "none" : "transform 150ms ease";
  }

  function moveDrag(e: PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    if (e.clientY < 48) window.scrollBy(0, -12);
    else if (e.clientY > window.innerHeight - 48) window.scrollBy(0, 12);
    const dy = e.clientY + window.scrollY - d.startY;
    const center = d.tops[d.from] + d.heights[d.from] / 2 + dy;
    let to = d.from;
    for (let k = 0; k < d.tops.length; k++) {
      const mid = d.tops[k] + d.heights[k] / 2;
      if (k > d.from && center > mid) to = Math.max(to, k);
      if (k < d.from && center < mid) to = Math.min(to, k);
    }
    d.to = to;
    const shift = d.heights[d.from] + d.gap;
    for (const [k, r] of rows().entries()) {
      if (k === d.from) r.style.transform = `translateY(${dy}px)`;
      else if (k > d.from && k <= to) r.style.transform = `translateY(${-shift}px)`;
      else if (k < d.from && k >= to) r.style.transform = `translateY(${shift}px)`;
      else r.style.transform = "";
    }
  }

  function up(e: PointerEvent<HTMLButtonElement>, cancelled: boolean) {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    drag.current = null;
    reset();
    if (!cancelled && d.to !== d.from) move(d.id, d.to - d.from);
  }

  function key(e: KeyboardEvent<HTMLButtonElement>, id: string) {
    if (disabled) return;
    const by = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    if (!by) return;
    e.preventDefault();
    move(id, by);
  }

  return (
    <Tag ref={listRef} className={className}>
      {order.map((item, i) =>
        children(
          item,
          i,
          <button
            type="button"
            aria-label="Drag to reorder"
            title="Drag to reorder"
            data-testid="drag-handle"
            disabled={disabled}
            className="-mr-2 -mt-2 inline-flex h-11 w-11 shrink-0 cursor-grab touch-none select-none items-center justify-center rounded-lg text-dim hover:bg-ink/5 hover:text-ink active:cursor-grabbing disabled:cursor-default disabled:opacity-40"
            onPointerDown={(e) => down(e, item.id)}
            onPointerMove={moveDrag}
            onPointerUp={(e) => up(e, false)}
            onPointerCancel={(e) => up(e, true)}
            onKeyDown={(e) => key(e, item.id)}
          >
            <svg aria-hidden="true" width="14" height="20" viewBox="0 0 14 20" fill="currentColor">
              <circle cx="4" cy="4" r="1.6" />
              <circle cx="10" cy="4" r="1.6" />
              <circle cx="4" cy="10" r="1.6" />
              <circle cx="10" cy="10" r="1.6" />
              <circle cx="4" cy="16" r="1.6" />
              <circle cx="10" cy="16" r="1.6" />
            </svg>
          </button>
        )
      )}
    </Tag>
  );
}
