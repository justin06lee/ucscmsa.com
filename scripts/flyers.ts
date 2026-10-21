// Reads flyer images from Justin's saved folder (default
// ~/.local/share/midna-ucscmsa/flyers/Msa events/) and matches each to the
// WhatsApp announcement it was posted with, by the timestamp in its filename.
//
// WhatsApp saves photos as PHOTO-YYYY-MM-DD-HH-MM-SS.jpg in the phone's local
// (Santa Cruz) wall-clock time — the same instant the announcement was sent —
// so a flyer and its message line up to the second. An album sent at once
// becomes PHOTO-…-SS.jpg, PHOTO-…-SS(1).jpg, PHOTO-…-SS(2).jpg; those keep
// their order via the (n) suffix.

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fromZonedTime } from "date-fns-tz";

export const SITE_TZ = "America/Los_Angeles";
const FLYER_RE = /^PHOTO-(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})(?:\((\d+)\))?\.(?:jpe?g|png|webp)$/i;

export type Flyer = { file: string; unix: number; seq: number };

/** Parse a PHOTO-… filename into its send instant (unix s) and album index. */
export function parseFlyerName(name: string): { unix: number; seq: number } | null {
  const m = FLYER_RE.exec(name);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, seq] = m;
  const date = fromZonedTime(`${y}-${mo}-${d}T${h}:${mi}:${s}`, SITE_TZ);
  if (Number.isNaN(date.getTime())) return null;
  return { unix: Math.floor(date.getTime() / 1000), seq: seq ? Number(seq) : 0 };
}

/** Every flyer in dir, parsed, sorted by (time, album index). Odd names skipped. */
export function indexFlyers(dir: string): Flyer[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return []; // the folder may not exist; the caller treats that as "no flyers"
  }
  const flyers: Flyer[] = [];
  for (const name of names) {
    const p = parseFlyerName(name);
    if (p) flyers.push({ file: join(dir, name), unix: p.unix, seq: p.seq });
  }
  return flyers.sort((a, b) => a.unix - b.unix || a.seq - b.seq);
}

/**
 * Assign each flyer to the nearest message send time within `toleranceSec`.
 * Returns a map from that message's unix time to its flyer files, in order,
 * plus the flyers that matched no message. A flyer never splits across
 * messages; an album (same instant) stays together on one message.
 */
export function assignFlyers(flyers: Flyer[], messageUnix: number[], toleranceSec = 90): { byMessage: Map<number, string[]>; unmatched: string[] } {
  const msgs = [...new Set(messageUnix)].sort((a, b) => a - b);
  const byMessage = new Map<number, string[]>();
  const unmatched: string[] = [];
  for (const f of flyers) {
    let best = -1;
    let bestDiff = Infinity;
    for (const mu of msgs) {
      const diff = Math.abs(mu - f.unix);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = mu;
      } else if (mu > f.unix && diff > bestDiff) {
        break; // msgs is sorted; once past the flyer, the gap only grows
      }
    }
    if (best >= 0 && bestDiff <= toleranceSec) {
      const arr = byMessage.get(best) ?? [];
      arr.push(f.file); // flyers are pre-sorted, so each list stays ordered
      byMessage.set(best, arr);
    } else {
      unmatched.push(f.file);
    }
  }
  return { byMessage, unmatched };
}
