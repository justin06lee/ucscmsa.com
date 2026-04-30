import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BoilTickerProvider } from "./boil-ticker";
import { WiggleLetters } from "./wiggle-letters";

function mockReducedMotion(prefers: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? prefers : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

describe("WiggleLetters", () => {
  beforeEach(() => {
    mockReducedMotion(true);
  });

  it("renders one <img> per glyph with variant 1 when reduced motion is on", () => {
    const { container } = render(
      <BoilTickerProvider>
        <WiggleLetters />
      </BoilTickerProvider>
    );
    // Inner glyph <img> tags use alt="" which maps to role="presentation", so
    // role-based queries don't find them. Query the DOM directly.
    const imgs = container.querySelectorAll("img");
    // Glyphs: m, s, a, at, u, c, s, c = 8
    expect(imgs).toHaveLength(8);
    for (const img of imgs) {
      expect(img.src).toMatch(/-1\.png$/);
    }
  });

  it("wraps the whole row in an accessible label", () => {
    render(
      <BoilTickerProvider>
        <WiggleLetters />
      </BoilTickerProvider>
    );
    expect(screen.getByLabelText("MSA at UCSC")).toBeInTheDocument();
  });
});
