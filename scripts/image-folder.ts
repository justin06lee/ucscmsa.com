// msa-sync's --images <folder> input: a generic folder of flyer images (say,
// ones Justin exported from Photos or iCloud), each matched to the WhatsApp
// announcement it belongs to. The folder is only read, never written.
//
// Each image is dated by, in order: a timestamp in its filename (PHOTO-…,
// "WhatsApp Image 2025-10-08 at 12.34.56", IMG_20251008_123456), its EXIF
// capture date (JPEG), or the file's modification time. The announcements
// near that date are the candidates, and the primary model reads the image to
// pick the one it belongs to. Only a confident pick is attached; anything
// else goes to the review file. A matched image only joins the event's images;
// it never changes the event's details.

import { closeSync, openSync, readdirSync, readSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { z } from "zod";
import { extractJson, type CallModel } from "./eventify";
import { parseFlyerName, SITE_TZ } from "./flyers";

export type DatedImage = { file: string; unix: number; from: "filename" | "exif" | "mtime" };
export type Candidate = { sourceId: string; unix: number; text: string };

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
// 24-hour stamps only; a 12-hour "… at 11.23.45 PM" is left to EXIF/mtime.
const STAMP_RE = /(\d{4})-?(\d{2})-?(\d{2})(?:[ _T-]|\sat\s)(\d{2})[.:-]?(\d{2})[.:-]?(\d{2})(?!\s?[AP]M)/i;

/** Wall-clock "YYYY-MM-DDTHH:MM:SS" in Santa Cruz → unix seconds, or null. */
function wallUnix(y: string, mo: string, d: string, h: string, mi: string, s: string): number | null {
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31 || +h > 23 || +mi > 59 || +s > 59) return null;
  const t = fromZonedTime(`${y}-${mo}-${d}T${h}:${mi}:${s}`, SITE_TZ).getTime();
  return Number.isNaN(t) ? null : Math.floor(t / 1000);
}

/** The instant a filename's timestamp names, read as Santa Cruz time. */
export function filenameUnix(name: string): number | null {
  const photo = parseFlyerName(name);
  if (photo) return photo.unix;
  const m = STAMP_RE.exec(name);
  return m ? wallUnix(m[1], m[2], m[3], m[4], m[5], m[6]) : null;
}

/**
 * The capture date in a TIFF/EXIF block, as "YYYY:MM:DD HH:MM:SS":
 * DateTimeOriginal, else DateTimeDigitized, else IFD0's DateTime.
 */
export function exifDate(tiff: Buffer): string | null {
  const order = tiff.toString("latin1", 0, 2);
  if (order !== "II" && order !== "MM") return null;
  const le = order === "II";
  const u16 = (o: number) => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
  const u32 = (o: number) => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
  const ifd = (off: number) => {
    const entries = new Map<number, number>(); // tag -> offset of its 12-byte entry
    const n = u16(off);
    for (let k = 0; k < n; k++) entries.set(u16(off + 2 + 12 * k), off + 2 + 12 * k);
    return entries;
  };
  const ascii = (entry: number | undefined) => {
    if (entry === undefined) return null;
    const count = u32(entry + 4);
    const at = count > 4 ? u32(entry + 8) : entry + 8;
    const s = tiff.toString("latin1", at, at + count).replace(/\0+$/, "");
    return /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? s : null;
  };
  try {
    const ifd0 = ifd(u32(4));
    const exifPtr = ifd0.get(0x8769);
    const exif = exifPtr === undefined ? new Map<number, number>() : ifd(u32(exifPtr + 8));
    return ascii(exif.get(0x9003)) ?? ascii(exif.get(0x9004)) ?? ascii(ifd0.get(0x0132));
  } catch {
    return null; // truncated or malformed: no date
  }
}

/** The EXIF block of a JPEG (its APP1 "Exif" segment), or null. */
export function jpegExif(buf: Buffer): Buffer | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 4 <= buf.length && buf[i] === 0xff) {
    const marker = buf[i + 1];
    if (marker === 0xda || marker === 0xd9) break; // image data begins: no more metadata
    const len = buf.readUInt16BE(i + 2);
    if (marker === 0xe1 && buf.toString("latin1", i + 4, i + 10) === "Exif\0\0") return buf.subarray(i + 10, i + 2 + len);
    i += 2 + len;
  }
  return null;
}

function readHead(file: string, bytes: number): Buffer {
  const fd = openSync(file, "r");
  try {
    const buf = Buffer.alloc(bytes);
    return buf.subarray(0, readSync(fd, buf, 0, bytes, 0));
  } finally {
    closeSync(fd);
  }
}

/** Date one image: filename timestamp, then EXIF, then file mtime. */
export function dateImage(file: string): DatedImage {
  const name = file.slice(file.lastIndexOf("/") + 1);
  const fromName = filenameUnix(name);
  if (fromName !== null) return { file, unix: fromName, from: "filename" };
  if (/\.jpe?g$/i.test(name)) {
    const tiff = jpegExif(readHead(file, 256 * 1024));
    const d = tiff && exifDate(tiff);
    const m = d?.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
    const unix = m ? wallUnix(m[1], m[2], m[3], m[4], m[5], m[6]) : null;
    if (unix !== null) return { file, unix, from: "exif" };
  }
  return { file, unix: Math.floor(statSync(file).mtimeMs / 1000), from: "mtime" };
}

/** Every image in dir (not subfolders), dated; other files (HEIC included) listed apart. */
export function indexImageFolder(dir: string): { images: DatedImage[]; unsupported: string[] } {
  const images: DatedImage[] = [];
  const unsupported: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith(".")) continue;
    const file = join(dir, name);
    if (!statSync(file).isFile()) continue;
    if (IMAGE_EXT.has(extname(name).toLowerCase())) images.push(dateImage(file));
    else unsupported.push(file);
  }
  return { images, unsupported };
}

/**
 * The announcements an image could belong to: within 10 minutes of a filename
 * timestamp (the send instant; a flyer can follow its text by minutes), or 14
 * days of an EXIF/mtime date; nearest first, at most 8.
 */
export function candidatesFor(img: DatedImage, announcements: Candidate[]): Candidate[] {
  const window = img.from === "filename" ? 600 : 14 * 86400;
  return announcements
    .filter((a) => Math.abs(a.unix - img.unix) <= window)
    .sort((a, b) => Math.abs(a.unix - img.unix) - Math.abs(b.unix - img.unix))
    .slice(0, 8);
}

export const MATCH_SYSTEM_PROMPT = `You match one flyer image to the UC Santa Cruz Muslim Student Association (MSA) WhatsApp announcement it was posted with. You get the image and a numbered list of candidate announcements, each with its send time and text.

Pick the candidate the flyer clearly belongs to: the same event, by its title, date or place. If none clearly fits, or the image is not an event flyer, pick none.

Reply with only a JSON object: {"match": <candidate number, or null>, "confidence": <0 to 1>, "evidence": "<a short quote from the flyer>"}`;

const matchSchema = z.object({
  match: z.number().int().nullable(),
  confidence: z.number().min(0).max(1),
  evidence: z.string().optional(),
});

export type ImageMatch = { file: string; sourceId: string; confidence: number; evidence: string };

/**
 * Ask the model which candidate each image belongs to. A pick at or above
 * `floor` is a match; no candidates, no pick or a low score goes to review.
 * A failed model call is an error (the image is left for the next run).
 */
export async function matchImages(
  images: DatedImage[],
  announcements: Candidate[],
  opts: { call: CallModel; model: string; floor?: number; load: (file: string) => { imageBase64: string; imageMediaType: string } | null },
): Promise<{ matched: ImageMatch[]; review: { file: string; note: string }[]; errors: { file: string; error: string }[] }> {
  const floor = opts.floor ?? 0.8;
  const matched: ImageMatch[] = [];
  const review: { file: string; note: string }[] = [];
  const errors: { file: string; error: string }[] = [];
  for (const img of images) {
    const cands = candidatesFor(img, announcements);
    if (!cands.length) {
      review.push({ file: img.file, note: `no announcement within ${img.from === "filename" ? "10 minutes" : "14 days"} of its ${img.from} date` });
      continue;
    }
    const pic = opts.load(img.file);
    if (!pic) {
      review.push({ file: img.file, note: "unreadable or over 5 MB" });
      continue;
    }
    const list = cands
      .map((c, i) => `[${i + 1}] sent ${formatInTimeZone(new Date(c.unix * 1000), SITE_TZ, "EEE yyyy-MM-dd HH:mm")} (Santa Cruz)\n${c.text.slice(0, 800)}`)
      .join("\n\n");
    try {
      let parsed: z.infer<typeof matchSchema> | null = null;
      for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
        const raw = await opts.call({ model: opts.model, system: MATCH_SYSTEM_PROMPT, text: `Candidate announcements:\n\n${list}`, ...pic });
        try {
          const r = matchSchema.safeParse(extractJson(raw));
          if (r.success) parsed = r.data;
        } catch {
          /* no JSON in the reply; try once more */
        }
      }
      if (!parsed) {
        review.push({ file: img.file, note: "the model gave no usable answer" });
        continue;
      }
      const pick = parsed.match === null ? undefined : cands[parsed.match - 1];
      if (!pick) review.push({ file: img.file, note: `no candidate fits${parsed.evidence ? ` (flyer: "${parsed.evidence}")` : ""}` });
      else if (parsed.confidence < floor) review.push({ file: img.file, note: `low confidence ${parsed.confidence} for ${pick.sourceId}${parsed.evidence ? ` (flyer: "${parsed.evidence}")` : ""}` });
      else matched.push({ file: img.file, sourceId: pick.sourceId, confidence: parsed.confidence, evidence: parsed.evidence ?? "" });
    } catch (e) {
      errors.push({ file: img.file, error: (e as Error).message });
    }
  }
  return { matched, review, errors };
}
