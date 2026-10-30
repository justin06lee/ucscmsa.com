"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import type { Flyer } from "@/lib/event-media";

const ZOOM = 2.5;
const CLOSE_DRAG = 90; // px pulled down that closes the viewer

/**
 * The event page's flyers: the first one big (never cropped; its space held
 * before it loads), any others as thumbnails below. Each opens the
 * full-screen viewer.
 */
export function FlyerGallery({ title, flyers, className = "" }: { title: string; flyers: Flyer[]; className?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (flyers.length === 0) return null;
  const hero = flyers[0].page;
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(0)}
        className="pasted group mx-auto cursor-zoom-in"
        // Full column width, but no taller than most of the screen.
        style={{
          aspectRatio: `${hero.width} / ${hero.height}`,
          width: "100%",
          maxWidth: `min(100%, calc(min(70svh, 680px) * ${hero.width / hero.height}))`,
        }}
      >
        <span className="sr-only">Open full screen: </span>
        <Image
          src={hero.src}
          width={hero.width}
          height={hero.height}
          alt={hero.alt}
          unoptimized
          loading="eager"
          fetchPriority="high"
          className="h-full w-full object-contain"
        />
      </button>
      {flyers.length > 1 ? (
        <ul className="mt-5 flex flex-wrap justify-center gap-2.5" aria-label={`All ${flyers.length} flyers`}>
          {flyers.map((f, i) => (
            <li key={f.card.src}>
              <button
                type="button"
                onClick={() => setOpen(i)}
                aria-label={`Open flyer ${i + 1} of ${flyers.length} full screen`}
                className="block overflow-hidden bg-[var(--color-scrap)] shadow-[0_1px_2px_rgb(21_19_18/0.22)] transition-transform hover:-translate-y-0.5"
                // A touch target even for a wide flyer (contained, not cropped).
                style={{ width: 56, height: Math.round(Math.min(Math.max(56 * (f.card.height / f.card.width), 44), 75)) }}
              >
                <Image src={f.card.src} width={f.card.width} height={f.card.height} alt="" unoptimized className="h-full w-full object-contain" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open != null ? <FlyerViewer title={title} flyers={flyers} start={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

/**
 * Full screen, one flyer at a time. A native modal <dialog>: it traps focus,
 * makes the page behind it inert, closes on Esc and hands focus back to the
 * button that opened it. Swipe or arrow keys between flyers (CSS scroll
 * snap), pull down to close, tap or the zoom button to zoom in and pan; the
 * browser's own pinch zoom works too. Mounted while open, from `start`.
 */
export function FlyerViewer({
  title,
  flyers,
  start,
  onClose,
}: {
  title: string;
  flyers: Flyer[];
  start: number;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [index, setIndex] = useState(start);
  const [zoomed, setZoomed] = useState(false);
  const [pull, setPull] = useState(0);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const many = flyers.length > 1;

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (!d.open) d.showModal();
    // React's autoFocus runs before showModal and sets no attribute for the
    // dialog to find, so focus goes to Close here.
    closeButton.current?.focus();
    const html = document.documentElement;
    html.style.overflow = "hidden";
    const t = track.current;
    if (t) t.scrollTo({ left: start * t.clientWidth, behavior: "instant" });
    // No d.close() here: it fires "close", and onClose would unmount the
    // viewer when Strict Mode re-runs this effect. Unmounting removes the
    // dialog, which leaves the top layer by itself.
    return () => {
      html.style.overflow = "";
    };
    // Opens once, at the flyer it was mounted with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Closing the dialog (Esc, the close button, a pull down) hands focus back
  // to the button that opened it; then the gallery unmounts the viewer.
  const close = () => dialog.current?.close();

  function go(i: number) {
    const t = track.current;
    if (!t || i < 0 || i >= flyers.length) return;
    setZoomed(false);
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    t.scrollTo({ left: i * t.clientWidth, behavior: smooth ? "smooth" : "instant" });
  }

  function zoomAt(slide: HTMLElement | null, img: HTMLElement | null, clientX?: number, clientY?: number) {
    if (zoomed) {
      setZoomed(false);
      return;
    }
    // Keep the point under the finger (or the middle) where it was.
    const box = img?.getBoundingClientRect();
    const fx = box && clientX != null ? (clientX - box.left) / box.width : 0.5;
    const fy = box && clientY != null ? (clientY - box.top) / box.height : 0.3;
    setZoomed(true);
    requestAnimationFrame(() => {
      if (!slide || !img) return;
      slide.scrollLeft = fx * img.offsetWidth - slide.clientWidth / 2;
      slide.scrollTop = fy * img.offsetHeight - slide.clientHeight / 2;
    });
  }

  function onPointerDown(e: ReactPointerEvent) {
    if (zoomed || !e.isPrimary) return;
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
  }
  function onPointerMove(e: ReactPointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) d.moved = true;
    setPull(dy > 0 && dy > Math.abs(dx) ? dy : 0);
  }
  function onPointerUp() {
    const pulled = pull;
    // Cleared after the click that follows a drag, so it doesn't zoom.
    if (drag.current) setTimeout(() => (drag.current = null), 0);
    setPull(0);
    if (pulled > CLOSE_DRAG) close();
  }

  const current = flyers[index];
  return (
    <dialog
      ref={dialog}
      aria-label={many ? `${title} flyers` : `${title} flyer`}
      onClose={onClose}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(index + 1);
        else if (e.key === "ArrowLeft") go(index - 1);
      }}
      className="flyer-viewer fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden bg-black/95 p-0 text-paper backdrop:bg-black/80"
    >
      <div className="flex h-full flex-col" style={{ opacity: 1 - Math.min(pull / 400, 0.6) }}>
        <div className="flex shrink-0 items-center justify-between gap-2 px-2 py-2">
          <p className="min-w-0 truncate px-2 text-sm text-paper/85" aria-live="polite">
            {many ? `${index + 1} / ${flyers.length}` : <span className="sr-only">{current?.full.alt}</span>}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                const slide = track.current?.children[index] as HTMLElement | undefined;
                zoomAt(slide ?? null, slide?.querySelector("img") ?? null);
              }}
              aria-label={zoomed ? "Zoom out" : "Zoom in"}
              aria-pressed={zoomed}
              className="flex h-11 w-11 items-center justify-center rounded-full text-paper/90 hover:bg-white/10"
            >
              {zoomed ? <ZoomOut size={20} /> : <ZoomIn size={20} />}
            </button>
            <button
              ref={closeButton}
              type="button"
              onClick={close}
              aria-label="Close"
              className="flex h-11 w-11 items-center justify-center rounded-full text-paper/90 hover:bg-white/10"
            >
              <X size={22} />
            </button>
          </div>
        </div>
        <div className="relative min-h-0 flex-1">
          <div
            ref={track}
            onScroll={(e) => {
              const t = e.currentTarget;
              const i = Math.round(t.scrollLeft / t.clientWidth);
              if (i !== index) {
                setIndex(i);
                setZoomed(false);
              }
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className={`flex h-full w-full ${zoomed ? "overflow-hidden" : "snap-x snap-mandatory overflow-x-auto"} [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
            // Sideways swipes scroll between flyers and pinch zooms; a pull
            // down comes to us, to close.
            style={{ touchAction: zoomed ? "auto" : "pan-x pinch-zoom" }}
          >
            {flyers.map((f, i) => (
              <div
                key={f.full.src}
                className={`flex h-full w-full shrink-0 snap-center ${
                  zoomed && i === index ? "items-start justify-start overflow-auto" : "items-center justify-center overflow-hidden"
                } p-2`}
              >
                {/* Pointer users tap the flyer to zoom; keyboard users have the zoom button. */}
                <Image
                  src={f.full.src}
                  width={f.full.width}
                  height={f.full.height}
                  alt={f.full.alt}
                  unoptimized
                  loading={Math.abs(i - start) <= 1 ? "eager" : "lazy"}
                  draggable={false}
                  onClick={(e) => {
                    if (drag.current?.moved) return;
                    zoomAt(e.currentTarget.parentElement, e.currentTarget, e.clientX, e.clientY);
                  }}
                  className={
                    zoomed && i === index
                      ? "max-w-none cursor-zoom-out select-none"
                      : "max-h-full w-auto max-w-full cursor-zoom-in select-none object-contain"
                  }
                  style={
                    zoomed && i === index
                      ? { width: `calc(min(100vw, (100dvh - 4rem) * ${f.full.width / f.full.height}) * ${ZOOM})`, height: "auto" }
                      : { height: "auto", maxHeight: "100%", transform: i === index && pull ? `translateY(${pull}px)` : undefined }
                  }
                />
              </div>
            ))}
          </div>
          {many ? (
            <>
              <button
                type="button"
                onClick={() => go(index - 1)}
                disabled={index === 0}
                aria-label="Previous flyer"
                className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-paper hover:bg-black/60 disabled:opacity-0"
              >
                <ChevronLeft size={24} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => go(index + 1)}
                disabled={index === flyers.length - 1}
                aria-label="Next flyer"
                className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-paper hover:bg-black/60 disabled:opacity-0"
              >
                <ChevronRight size={24} aria-hidden="true" />
              </button>
            </>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
