// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CallModel } from "./eventify";
import { candidatesFor, dateImage, exifDate, filenameUnix, indexImageFolder, jpegExif, matchImages, type Candidate, type DatedImage } from "./image-folder";

const unix = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

/** A minimal TIFF block: IFD0 with DateTime and/or a pointer to an Exif IFD holding DateTimeOriginal. */
function buildTiff(le: boolean, d: { dateTime?: string; original?: string }): Buffer {
  const buf = Buffer.alloc(400);
  const w16 = (o: number, v: number) => (le ? buf.writeUInt16LE(v, o) : buf.writeUInt16BE(v, o));
  const w32 = (o: number, v: number) => (le ? buf.writeUInt32LE(v, o) : buf.writeUInt32BE(v, o));
  buf.write(le ? "II" : "MM", 0, "latin1");
  w16(2, 42);
  w32(4, 8);
  let data = 300;
  const writeIfd = (off: number, tags: [number, string | number][]) => {
    w16(off, tags.length);
    tags.forEach(([tag, v], k) => {
      const e = off + 2 + 12 * k;
      w16(e, tag);
      if (typeof v === "number") {
        w16(e + 2, 4);
        w32(e + 4, 1);
        w32(e + 8, v);
      } else {
        w16(e + 2, 2);
        w32(e + 4, v.length + 1);
        w32(e + 8, data);
        buf.write(`${v}\0`, data, "latin1");
        data += v.length + 1;
      }
    });
    w32(off + 2 + 12 * tags.length, 0);
  };
  const ifd0: [number, string | number][] = [];
  if (d.dateTime) ifd0.push([0x0132, d.dateTime]);
  if (d.original) ifd0.push([0x8769, 100]);
  writeIfd(8, ifd0);
  if (d.original) writeIfd(100, [[0x9003, d.original]]);
  return buf;
}

function jpegWithExif(tiff: Buffer): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x07, 0x4a, 0x46, 0x49, 0x46, 0x00]);
  const len = 2 + 6 + tiff.length;
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, len >> 8, len & 0xff]), Buffer.from("Exif\0\0", "latin1"), tiff]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, app1, Buffer.from([0xff, 0xda, 0x00, 0x02, 0x00, 0xff, 0xd9])]);
}

describe("filenameUnix", () => {
  it("reads WhatsApp's PHOTO names and common 24-hour stamps as Santa Cruz time", () => {
    expect(filenameUnix("PHOTO-2025-10-08-12-34-56.jpg")).toBe(unix("2025-10-08T19:34:56Z"));
    expect(filenameUnix("WhatsApp Image 2025-10-08 at 12.34.56.jpeg")).toBe(unix("2025-10-08T19:34:56Z"));
    expect(filenameUnix("IMG_20251208_093000.jpg")).toBe(unix("2025-12-08T17:30:00Z"));
  });
  it("leaves 12-hour stamps and plain names to EXIF/mtime", () => {
    expect(filenameUnix("Screenshot 2025-10-08 at 11.23.45 PM.png")).toBeNull();
    expect(filenameUnix("IMG_1234.jpg")).toBeNull();
    expect(filenameUnix("IMG_20251340_993000.jpg")).toBeNull();
  });
});

describe("exifDate / jpegExif", () => {
  it("prefers DateTimeOriginal over IFD0 DateTime, in either byte order", () => {
    for (const le of [true, false]) {
      expect(exifDate(buildTiff(le, { dateTime: "2026:01:01 00:00:00", original: "2025:10:08 12:34:56" }))).toBe("2025:10:08 12:34:56");
    }
  });
  it("falls back to IFD0 DateTime, and returns null for junk", () => {
    expect(exifDate(buildTiff(true, { dateTime: "2025:11:02 18:00:00" }))).toBe("2025:11:02 18:00:00");
    expect(exifDate(Buffer.from("not a tiff at all"))).toBeNull();
    expect(exifDate(buildTiff(true, {}).subarray(0, 9))).toBeNull();
  });
  it("finds the Exif segment in a JPEG", () => {
    const tiff = buildTiff(true, { original: "2025:10:08 12:34:56" });
    expect(exifDate(jpegExif(jpegWithExif(tiff))!)).toBe("2025:10:08 12:34:56");
    expect(jpegExif(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });
});

describe("dateImage / indexImageFolder", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "image-folder-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("dates by filename, then EXIF, then mtime", () => {
    writeFileSync(join(dir, "PHOTO-2025-10-08-12-34-56.jpg"), "x");
    writeFileSync(join(dir, "IMG_0001.jpg"), jpegWithExif(buildTiff(true, { original: "2025:11:02 18:00:00" })));
    writeFileSync(join(dir, "flyer.png"), "x");
    utimesSync(join(dir, "flyer.png"), 1_760_000_000, 1_760_000_000);
    expect(dateImage(join(dir, "PHOTO-2025-10-08-12-34-56.jpg"))).toMatchObject({ from: "filename", unix: unix("2025-10-08T19:34:56Z") });
    expect(dateImage(join(dir, "IMG_0001.jpg"))).toMatchObject({ from: "exif", unix: unix("2025-11-03T02:00:00Z") });
    expect(dateImage(join(dir, "flyer.png"))).toMatchObject({ from: "mtime", unix: 1_760_000_000 });
  });

  it("lists images, sets aside other files, and skips dotfiles and subfolders", () => {
    writeFileSync(join(dir, "a.jpg"), "x");
    writeFileSync(join(dir, "b.HEIC"), "x");
    writeFileSync(join(dir, ".DS_Store"), "x");
    mkdirSync(join(dir, "sub"));
    const { images, unsupported } = indexImageFolder(dir);
    expect(images.map((i) => i.file)).toEqual([join(dir, "a.jpg")]);
    expect(unsupported).toEqual([join(dir, "b.HEIC")]);
  });
});

const ann = (sourceId: string, iso: string, text = "Potluck Friday"): Candidate => ({ sourceId, unix: unix(iso), text });

describe("candidatesFor", () => {
  const anns = [ann("wa:a", "2025-10-08T19:34:00Z"), ann("wa:b", "2025-10-01T19:00:00Z"), ann("wa:c", "2025-09-01T19:00:00Z")];
  it("allows 10 minutes around a filename timestamp", () => {
    expect(candidatesFor({ file: "f", unix: unix("2025-10-08T19:43:00Z"), from: "filename" }, anns).map((c) => c.sourceId)).toEqual(["wa:a"]);
    expect(candidatesFor({ file: "f", unix: unix("2025-10-08T19:45:00Z"), from: "filename" }, anns)).toEqual([]);
  });
  it("allows 14 days around an EXIF/mtime date, nearest first", () => {
    expect(candidatesFor({ file: "f", unix: unix("2025-10-07T00:00:00Z"), from: "mtime" }, anns).map((c) => c.sourceId)).toEqual(["wa:a", "wa:b"]);
  });
});

describe("matchImages", () => {
  const img = (file: string, iso: string): DatedImage => ({ file, unix: unix(iso), from: "exif" });
  const anns = [ann("wa:a", "2025-10-08T19:34:00Z", "Henna night Oct 9"), ann("wa:b", "2025-10-06T19:00:00Z", "Halaqa Monday")];
  const load = () => ({ imageBase64: "AAAA", imageMediaType: "image/jpeg" });
  const reply = (o: unknown): CallModel => async () => `Here you go:\n${JSON.stringify(o)}`;

  it("attaches a confident pick, with the candidates numbered nearest first", async () => {
    const seen: string[] = [];
    const call: CallModel = async (req) => {
      seen.push(req.text);
      return JSON.stringify({ match: 1, confidence: 0.92, evidence: "HENNA NIGHT" });
    };
    const r = await matchImages([img("/f/1.jpg", "2025-10-08T20:00:00Z")], anns, { call, model: "haiku", load });
    expect(r.matched).toEqual([{ file: "/f/1.jpg", sourceId: "wa:a", confidence: 0.92, evidence: "HENNA NIGHT" }]);
    expect(seen[0]).toMatch(/\[1\] sent Wed 2025-10-08 12:34 \(Santa Cruz\)\nHenna night/);
  });

  it("sends low confidence, no pick and an out-of-range pick to review", async () => {
    const low = await matchImages([img("/f/1.jpg", "2025-10-08T20:00:00Z")], anns, { call: reply({ match: 2, confidence: 0.5 }), model: "haiku", load });
    expect(low.review[0].note).toMatch(/low confidence 0.5 for wa:b/);
    const none = await matchImages([img("/f/1.jpg", "2025-10-08T20:00:00Z")], anns, { call: reply({ match: null, confidence: 0.9, evidence: "EID" }), model: "haiku", load });
    expect(none.review[0].note).toBe('no candidate fits (flyer: "EID")');
    const bad = await matchImages([img("/f/1.jpg", "2025-10-08T20:00:00Z")], anns, { call: reply({ match: 7, confidence: 0.99 }), model: "haiku", load });
    expect(bad.matched).toEqual([]);
    expect(bad.review).toHaveLength(1);
  });

  it("reviews an image with no announcement nearby, without calling the model", async () => {
    let calls = 0;
    const r = await matchImages([img("/f/1.jpg", "2024-01-01T00:00:00Z")], anns, { call: async () => (calls++, "{}"), model: "haiku", load });
    expect(calls).toBe(0);
    expect(r.review[0].note).toMatch(/no announcement within 14 days/);
  });

  it("retries an unparseable reply once, then reviews it", async () => {
    let calls = 0;
    const r = await matchImages([img("/f/1.jpg", "2025-10-08T20:00:00Z")], anns, { call: async () => (calls++, "sorry, can't tell"), model: "haiku", load });
    expect(calls).toBe(2);
    expect(r.review[0].note).toBe("the model gave no usable answer");
  });

  it("reports a failed model call as an error, not a review", async () => {
    const r = await matchImages([img("/f/1.jpg", "2025-10-08T20:00:00Z")], anns, {
      call: async () => {
        throw new Error("yagami unreachable");
      },
      model: "haiku",
      load,
    });
    expect(r.errors).toEqual([{ file: "/f/1.jpg", error: "yagami unreachable" }]);
    expect(r.review).toEqual([]);
  });
});
