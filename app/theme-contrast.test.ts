import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// WCAG 2.x relative luminance and contrast ratio.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const css = readFileSync(path.join(__dirname, "globals.css"), "utf8");
function token(name: string): string {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`--color-${name} not found`);
  return m[1];
}

describe("theme text colors on paper (WCAG 2.2 AA, 4.5:1 for body text)", () => {
  const paper = token("paper");

  it.each(["ink", "dim", "burgundy"])("--color-%s is readable on --color-paper", (name) => {
    expect(contrast(token(name), paper)).toBeGreaterThanOrEqual(4.5);
  });

  it("--color-dim stays readable on the bg-ink/5 hover background", () => {
    // bg-ink/5 = 5% ink over paper
    const mix = (i: number) =>
      Math.round(0.05 * parseInt(token("ink").slice(i, i + 2), 16) + 0.95 * parseInt(paper.slice(i, i + 2), 16))
        .toString(16)
        .padStart(2, "0");
    const hover = `#${mix(1)}${mix(3)}${mix(5)}`;
    expect(contrast(token("dim"), hover)).toBeGreaterThanOrEqual(4.5);
  });
});
