"use client";

import { useBoilTick } from "./boil-ticker";

type Glyph = {
  key: string;
  file: string;
  marginLeft?: number;
};

const PHRASE: Glyph[] = [
  { key: "m", file: "m" },
  { key: "s1", file: "s" },
  { key: "a1", file: "a" },
  { key: "at", file: "at", marginLeft: 16 },
  { key: "u", file: "u", marginLeft: 16 },
  { key: "c1", file: "c" },
  { key: "s2", file: "s" },
  { key: "c2", file: "c" },
];

function phaseForIndex(i: number): number {
  return (i * 1103515245 + 12345) & 3;
}

export function WiggleLetters() {
  const tick = useBoilTick();
  return (
    <span
      role="img"
      aria-label="MSA at UCSC"
      className="inline-flex items-end gap-1 select-none"
    >
      {PHRASE.map((g, i) => {
        // When tick is 0 (reduced motion), show variant 1 for every glyph.
        // Otherwise apply a per-glyph phase offset so the wiggle is desynced.
        const variant = tick === 0 || (tick + phaseForIndex(i)) % 2 === 0 ? 1 : 2;
        return (
          <img
            key={g.key}
            src={`/letters/${g.file}-${variant}.png`}
            alt=""
            aria-hidden="true"
            draggable={false}
            style={{
              height: "clamp(48px, 10vw, 96px)",
              width: "auto",
              marginLeft: g.marginLeft,
            }}
          />
        );
      })}
    </span>
  );
}
