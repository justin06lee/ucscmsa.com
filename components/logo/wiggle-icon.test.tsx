import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { WiggleIcon } from "./wiggle-icon";

const LETTERS = path.join(__dirname, "../../public/letters");

describe("logo frames", () => {
  it("WiggleIcon serves display-sized WebP, not the 480px PNG masters", () => {
    const { container } = render(<WiggleIcon size={28} alt="" />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toMatch(/^\/letters\/icon-1-400\.webp$/);
    expect(img.getAttribute("srcset")).toContain("icon-1-192.webp 192w");
    expect(img.getAttribute("sizes")).toBe("28px");
  });

  it("every frame the logo can show exists as a small WebP", () => {
    const frames = [
      ...["m", "s", "a", "at", "u", "c"].flatMap((g) => [`${g}-1.webp`, `${g}-2.webp`]),
      ...[1, 2].flatMap((v) => [`icon-${v}-192.webp`, `icon-${v}-400.webp`]),
    ];
    const onDisk = new Set(readdirSync(LETTERS));
    for (const f of frames) {
      expect(onDisk.has(f), f).toBe(true);
      // The PNG masters are ~200 KiB each; ~3.3 MB on the landing page.
      expect(statSync(path.join(LETTERS, f)).size, f).toBeLessThan(32 * 1024);
    }
  });
});
