"use client";

import { useBoilTick } from "./boil-ticker";

export function WiggleIcon({
  size = 120,
  alt = "MSA at UCSC logo",
  priority = false,
}: {
  size?: number;
  alt?: string;
  /** The landing hero: fetch it first, it is the page's LCP image. */
  priority?: boolean;
}) {
  const tick = useBoilTick();
  // When tick is 0 (reduced motion), show variant 1 statically.
  const variant = tick === 0 || (tick + 5) % 2 === 0 ? 1 : 2;
  const base = `/letters/icon-${variant}`;
  return (
    <img
      src={`${base}-400.webp`}
      srcSet={`${base}-192.webp 192w, ${base}-400.webp 400w`}
      sizes={`${size}px`}
      width={size}
      height={size}
      fetchPriority={priority ? "high" : undefined}
      alt={alt}
      aria-hidden={alt === "" ? true : undefined}
      draggable={false}
      style={{ width: size, height: size }}
    />
  );
}
