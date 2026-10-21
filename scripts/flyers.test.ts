// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assignFlyers, indexFlyers, parseFlyerName, type Flyer } from "./flyers";

// 2026-01-05 18:59:09 Santa Cruz (PST, -08:00) in unix seconds.
const JAN5 = Math.floor(Date.parse("2026-01-05T18:59:09-08:00") / 1000);

describe("parseFlyerName", () => {
  it("parses a PHOTO name as a Santa Cruz wall-clock instant", () => {
    expect(parseFlyerName("PHOTO-2026-01-05-18-59-09.jpg")).toEqual({ unix: JAN5, seq: 0 });
  });
  it("reads the album index from a (n) suffix", () => {
    expect(parseFlyerName("PHOTO-2026-01-05-18-59-09(2).jpg")?.seq).toBe(2);
  });
  it("handles DST: a July flyer is interpreted at -07:00", () => {
    const jul = parseFlyerName("PHOTO-2026-07-13-15-00-00.jpg")!;
    expect(jul.unix).toBe(Math.floor(Date.parse("2026-07-13T15:00:00-07:00") / 1000));
  });
  it("rejects a non-PHOTO name", () => {
    expect(parseFlyerName("IMG_1234.jpg")).toBeNull();
    expect(parseFlyerName("PHOTO-2026-01-05.jpg")).toBeNull();
  });
});

describe("indexFlyers", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "flyers-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("indexes only PHOTO images, sorted by time then album index", () => {
    for (const n of ["PHOTO-2026-01-05-18-59-09(1).jpg", "PHOTO-2026-01-05-18-59-09.jpg", "PHOTO-2025-12-02-21-52-34.jpg", "notes.txt", "IMG_1.jpg"]) {
      writeFileSync(join(dir, n), "x");
    }
    const flyers = indexFlyers(dir);
    expect(flyers.map((f) => f.file.split("/").pop())).toEqual(["PHOTO-2025-12-02-21-52-34.jpg", "PHOTO-2026-01-05-18-59-09.jpg", "PHOTO-2026-01-05-18-59-09(1).jpg"]);
  });

  it("returns [] when the folder is missing", () => {
    expect(indexFlyers(join(dir, "nope"))).toEqual([]);
  });
});

describe("assignFlyers", () => {
  const f = (unix: number, seq = 0, file = `${unix}-${seq}.jpg`): Flyer => ({ file, unix, seq });

  it("attaches a flyer to the message at its timestamp", () => {
    const { byMessage, unmatched } = assignFlyers([f(1000)], [1000, 5000]);
    expect(byMessage.get(1000)).toEqual(["1000-0.jpg"]);
    expect(unmatched).toEqual([]);
  });

  it("keeps an album (same instant) together and in order", () => {
    const { byMessage } = assignFlyers([f(1000, 0, "a.jpg"), f(1000, 1, "b.jpg"), f(1001, 0, "c.jpg")], [1000]);
    expect(byMessage.get(1000)).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
  });

  it("reports a flyer with no message within tolerance as unmatched", () => {
    const { byMessage, unmatched } = assignFlyers([f(1000)], [2000], 90);
    expect(byMessage.size).toBe(0);
    expect(unmatched).toEqual(["1000-0.jpg"]);
  });

  it("assigns each flyer to the nearest message", () => {
    const { byMessage } = assignFlyers([f(1040)], [1000, 1050], 90);
    expect(byMessage.get(1050)).toEqual(["1040-0.jpg"]);
    expect(byMessage.has(1000)).toBe(false);
  });
});
