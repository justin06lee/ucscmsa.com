"use client";

import { useEffect } from "react";

/**
 * Moves the home page's paper layers at their own speeds. A layer's data-depth
 * is how fast it drifts against the page as you scroll (above 0 lags behind and
 * looks far, below 0 races ahead and looks near); data-px is how far it leans
 * from the pointer. Layers with data-self measure from their own place on the
 * page, so a plant far down sits where it was put as it reaches mid-screen.
 * Transforms only, one write per frame, and no movement under reduced motion.
 *
 * It also tells the page what a phone's pull past the top or bottom should show
 * (data-sky on .jungle, read by the html rule in app/globals.css).
 */
export function JungleParallax() {
  useEffect(() => {
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const jungle = document.querySelector<HTMLElement>(".jungle");
    const layers = still ? [] : [...document.querySelectorAll<HTMLElement>("[data-depth]")].map((el) => ({
      el,
      depth: Number(el.dataset.depth),
      px: Number(el.dataset.px ?? 0),
      anchor: "self" in el.dataset ? el.parentElement : null,
    }));
    let frame = 0;
    let aim = 0;
    let lean = 0;
    const paint = () => {
      frame = 0;
      lean += (aim - lean) * 0.08;
      const vh = window.innerHeight;
      // Past the top, a phone reports a negative scroll: the layers hold still as it bounces.
      const top = Math.max(0, window.scrollY);
      const end = document.documentElement.scrollHeight - vh;
      if (jungle) jungle.dataset.sky = top < vh * 0.7 ? "top" : top > end - vh * 0.4 ? "end" : "mid";
      for (const { el, depth, px, anchor } of layers) {
        let y = top * depth;
        if (anchor) {
          const box = anchor.getBoundingClientRect();
          y = (vh / 2 - (box.top + box.height / 2)) * depth;
        }
        el.style.transform = `translate3d(${(lean * px).toFixed(2)}px, ${y.toFixed(1)}px, 0)`;
      }
      if (Math.abs(aim - lean) > 0.002) frame = requestAnimationFrame(paint);
    };
    const wake = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const onPointer = (e: PointerEvent) => {
      aim = (e.clientX / window.innerWidth) * 2 - 1;
      wake();
    };
    const pointerFine = matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (pointerFine && !still) window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", wake, { passive: true });
    wake();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", wake);
      window.removeEventListener("resize", wake);
    };
  }, []);
  return null;
}
