"use client";

import { useBoilTick } from "./boil-ticker";

export function WiggleIcon({
  size = 120,
  alt = "MSA at UCSC logo",
}: {
  size?: number;
  alt?: string;
}) {
  const tick = useBoilTick();
  // When tick is 0 (reduced motion), show variant 1 statically.
  const variant = tick === 0 || (tick + 5) % 2 === 0 ? 1 : 2;
  return (
    <img
      src={`/letters/icon-${variant}.png`}
      alt={alt}
      aria-hidden={alt === "" ? true : undefined}
      draggable={false}
      style={{ width: size, height: size }}
    />
  );
}
