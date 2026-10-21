// Turn one announcement (text, and an optional flyer image) into an event
// JSON for the import API. The model call is injected (CallModel) so tests
// run without a network. Two rules, from midna: never invent a time, and
// other groups' events open with "Hosted by <group>".
//
// A time is kept only when it is quoted from the message text, or both the
// primary (Haiku) and the verifier (Sonnet) model read the same time off the
// flyer. Anything unclear is dropped to a lower-precision event (start-only
// or date-only) or marked needs-review, never guessed.

import { z } from "zod";

/** One chat/post item to eventify. */
export type SourceItem = {
  /** The import sourceId, e.g. wa:<id> or ig:<shortcode>. */
  sourceId: string;
  /** Human sourceRef for the batch, e.g. "WhatsApp MSA announcements, 2026-10-18 18:11". */
  sourceRef: string;
  /** The Santa Cruz calendar date the message was sent, for resolving "this Friday". */
  sentDate: string;
  /** The message text / caption. May be empty when only a flyer carries the details. */
  text: string;
  /** base64 JPEG/PNG of the primary flyer the model reads, or null. */
  imageBase64?: string | null;
  imageMediaType?: string | null;
  /** Every flyer image of the post, in order (for display/upload later). */
  imagePaths?: string[];
};

/** A link found in the announcement, classified for the site's buttons. */
export const LINK_KINDS = ["rsvp", "form", "donate", "signup", "map", "other"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];
export type LinkEntry = { kind: LinkKind; label: string; url: string };

/** A single model request. Returns the raw assistant text. Injected for tests. */
export type CallModel = (req: {
  model: string;
  system: string;
  text: string;
  imageBase64?: string | null;
  imageMediaType?: string | null;
}) => Promise<string>;

const fieldClaim = z.object({
  value: z.string().nullable(),
  source: z.enum(["text", "flyer", "none"]).default("none"),
  quote: z.string().nullable().default(null),
});

// What the model is asked to return. Loose: the gateway drops schema
// enforcement, so parse defensively and let zod fill the gaps.
const modelSchema = z.object({
  isEvent: z.boolean(),
  skipReason: z.string().nullable().default(null),
  title: z.string().nullable().default(null),
  date: fieldClaim.default({ value: null, source: "none", quote: null }),
  startTime: fieldClaim.default({ value: null, source: "none", quote: null }),
  endTime: fieldClaim.default({ value: null, source: "none", quote: null }),
  location: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  hostOrg: z.string().nullable().default(null),
  links: z.array(z.object({ kind: z.string().default("other"), label: z.string().default(""), url: z.string() })).default([]),
  confidence: z.number().min(0).max(1).default(0),
});
export type ModelEvent = z.infer<typeof modelSchema>;

export type EventDraft = {
  sourceId: string;
  sourceRef: string;
  isEvent: boolean;
  skipReason?: string;
  title?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  description?: string;
  hostOrg?: string | null;
  /** Links grounded in the announcement text (never invented). */
  links: LinkEntry[];
  /** Every flyer image of the source, in order, passed through for later upload. */
  images: string[];
  confidence: number;
  needsReview: boolean;
  reviewNotes: string[];
};

export const SYSTEM_PROMPT = `You read one announcement from the UC Santa Cruz Muslim Student Association (MSA) and decide whether it announces a single real, dated event. You may be given the announcement text and a flyer image.

Return ONE JSON object and nothing else. No prose, no code fence. Fields:
- isEvent (boolean): true only if this announces a specific event with a determinable calendar date. False for: Jummah (the weekly Friday prayer, which admins manage separately), polls, deleted messages, forms/surveys/sign-ups with no event, giveaways, recaps, board-member intros, general reminders, and anything with no date.
- skipReason (string|null): one short phrase when isEvent is false.
- title (string|null): a short event title, no emoji.
- date, startTime, endTime: each an object { "value", "source", "quote" }.
  - value: date as YYYY-MM-DD; times as 24-hour HH:MM; null if not stated.
  - source: "text" if you read it in the announcement text, "flyer" if only the image shows it, "none" if not stated.
  - quote: the exact words you read it from (from the text when source is "text"), else null.
  - Resolve relative dates ("this Friday", "tomorrow") against the date the message was sent, which is given. Use the event's date, not the send date.
  - Never guess a time that is not shown. If no end time is shown, leave endTime null. If no time at all is shown, leave startTime and endTime null.
- location (string|null): the venue as stated, no personal addresses.
- description (string|null): the full announcement text, with its line breaks kept. Include public details (speakers, cost, cause, what to bring, RSVP wording). Remove only: phone numbers, personal payment handles (Venmo/Zelle/CashApp), and the names of private individuals. Do not summarize or add anything.
- hostOrg (string|null): the outside organization running it (e.g. SWANA, SJP, ICSC, a named Shaykh) when the MSA is not the host; null when the MSA runs it.
- links (array of { "kind", "label", "url" }): every URL that appears in the announcement TEXT. kind is one of rsvp, form, donate, signup, map, other. label is a short human label. Copy each url exactly as written; never invent or complete a URL, and do not include a URL that is only printed on the flyer image.
- confidence (number 0..1): your confidence that isEvent and the date are correct.

All times and dates are America/Los_Angeles (Santa Cruz) wall-clock. Output only the JSON object.`;

/**
 * Pull the last complete TOP-LEVEL JSON object from a model reply. Skips over
 * an object's own nested braces (so a nested field isn't mistaken for the
 * answer) and tolerates a ```json fence and prose around the object.
 */
export function extractJson(raw: string): unknown {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : raw;
  let last: unknown;
  let i = 0;
  while (i < body.length) {
    if (body[i] !== "{") {
      i++;
      continue;
    }
    let depth = 0;
    let inStr = false;
    let esc = false;
    let end = -1;
    for (let j = i; j < body.length; j++) {
      const c = body[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end === -1) break; // unbalanced from here on
    try {
      last = JSON.parse(body.slice(i, end + 1));
    } catch {
      /* not valid JSON; keep looking for a later object */
    }
    i = end + 1; // jump past this top-level object, nested braces and all
  }
  if (last === undefined) throw new Error("no JSON object in the model reply");
  return last;
}

/** Normalize text for quote matching: lowercase, collapse whitespace. */
function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Strip a URL to its comparable core (no trailing slash or punctuation). */
function normUrl(u: string): string {
  return u.trim().replace(/[).,;:!?'"\]]+$/, "").replace(/\/+$/, "").toLowerCase();
}

/** Guess a link's kind from its host when the model didn't give a usable one. */
function inferKind(url: string): LinkKind {
  const u = url.toLowerCase();
  if (/forms\.gle|docs\.google\.com\/forms|\/viewform|typeform|airtable/.test(u)) return "form";
  if (/partiful|lu\.ma|eventbrite|rsvp/.test(u)) return "rsvp";
  if (/launchgood|amanahfy|charityweek|gofundme|donate|givebutter|paypal\.com\/donate/.test(u)) return "donate";
  if (/maps\.google|maps\.app|goo\.gl\/maps|google\.com\/maps/.test(u)) return "map";
  if (/signup|sign-up|volunteer/.test(u)) return "signup";
  return "other";
}

const URL_RE = /https?:\/\/[^\s<>"')]+/gi;

/**
 * The announcement's real links: every URL in the text, classified. A URL the
 * model returned keeps its kind/label when the URL is genuinely in the text;
 * a URL only the model invented is dropped (it isn't in the text), and a URL
 * in the text the model missed is still kept.
 */
export function groundLinks(text: string, modelLinks: { kind: string; label: string; url: string }[]): LinkEntry[] {
  const byUrl = new Map<string, { kind: string; label: string; url: string }>();
  for (const l of modelLinks) if (l?.url) byUrl.set(normUrl(l.url), l);
  const out: LinkEntry[] = [];
  const seen = new Set<string>();
  for (const raw of text.match(URL_RE) ?? []) {
    const clean = raw.replace(/[).,;:!?'"\]]+$/, "");
    const key = normUrl(clean);
    if (seen.has(key)) continue;
    seen.add(key);
    const m = byUrl.get(key);
    const kind = m && (LINK_KINDS as readonly string[]).includes(m.kind) ? (m.kind as LinkKind) : inferKind(clean);
    const label = m?.label?.trim() || hostLabel(clean);
    out.push({ kind, label, url: clean });
  }
  return out;
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "link";
  }
}

/** Is the claimed time genuinely backed by the announcement text? */
function quotedInText(claim: ModelEvent["startTime"], text: string): boolean {
  if (claim.source !== "text" || !claim.quote) return false;
  return norm(text).includes(norm(claim.quote));
}

const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Call the model and parse its reply; one retry if the JSON is missing/invalid. */
async function callAndParse(call: CallModel, req: Parameters<CallModel>[0]): Promise<ModelEvent> {
  try {
    return modelSchema.parse(extractJson(await call(req)));
  } catch {
    return modelSchema.parse(extractJson(await call(req)));
  }
}

/**
 * Turn one item into an event draft. Primary model first; the verifier runs
 * only to confirm a flyer-only time. Times never come from thin air.
 */
export async function eventify(
  item: SourceItem,
  opts: { call: CallModel; primaryModel: string; verifierModel: string; confidenceFloor?: number },
): Promise<EventDraft> {
  const floor = opts.confidenceFloor ?? 0.6;
  const notes: string[] = [];
  const text = item.text ?? "";
  const userText = `Message sent on ${item.sentDate} (Santa Cruz).\n\nAnnouncement text:\n${text || "(no text; see the flyer)"}`;

  const primary = await callAndParse(opts.call, {
    model: opts.primaryModel,
    system: SYSTEM_PROMPT,
    text: userText,
    imageBase64: item.imageBase64,
    imageMediaType: item.imageMediaType,
  });

  const images = item.imagePaths ?? [];
  const base = { sourceId: item.sourceId, sourceRef: item.sourceRef, links: groundLinks(text, primary.links ?? []), images };

  if (!primary.isEvent) {
    return {
      ...base,
      isEvent: false,
      skipReason: primary.skipReason ?? "not an event",
      confidence: primary.confidence,
      needsReview: false,
      reviewNotes: [],
    };
  }

  // A date is mandatory for an event; without one it can't be imported.
  const date = primary.date.value;
  let needsReview = false;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    notes.push("no determinable date");
    needsReview = true;
  }

  // Decide each time. Text-quoted is trusted; flyer-only needs the verifier.
  const flyerTimesToCheck: Array<"startTime" | "endTime"> = [];
  const kept: { startTime?: string; endTime?: string } = {};
  for (const field of ["startTime", "endTime"] as const) {
    const claim = primary[field];
    const v = claim.value;
    if (!v) continue;
    if (!HM.test(v)) {
      notes.push(`dropped ${field}: "${v}" is not HH:MM`);
      continue;
    }
    if (quotedInText(claim, text)) {
      kept[field] = v;
    } else if (item.imageBase64) {
      flyerTimesToCheck.push(field);
    } else {
      notes.push(`dropped ${field} ${v}: only on a flyer that isn't available to verify`);
    }
  }

  if (flyerTimesToCheck.length > 0) {
    let verifier: ModelEvent | null = null;
    try {
      verifier = await callAndParse(opts.call, {
        model: opts.verifierModel,
        system: SYSTEM_PROMPT,
        text: userText,
        imageBase64: item.imageBase64,
        imageMediaType: item.imageMediaType,
      });
    } catch (e) {
      notes.push(`verifier failed (${(e as Error).message}); flyer times dropped`);
    }
    for (const field of flyerTimesToCheck) {
      const want = primary[field].value;
      const got = verifier?.[field].value ?? null;
      if (verifier && got === want) {
        kept[field] = want!;
      } else {
        notes.push(`dropped ${field} ${want}: read off the flyer but the verifier read ${got ?? "nothing"}`);
      }
    }
  }

  // endTime needs a startTime (schema rule); drop a stranded endTime.
  if (kept.endTime && !kept.startTime) {
    notes.push(`dropped endTime ${kept.endTime}: no start time to anchor it`);
    delete kept.endTime;
  }

  // Prefix other groups' events so the site doesn't read them as MSA-run.
  let description = primary.description ?? undefined;
  const host = primary.hostOrg?.trim() || null;
  if (host && description && !new RegExp(`^hosted by ${host}\\b`, "i").test(description)) {
    description = `Hosted by ${host}. ${description}`;
  } else if (host && !description) {
    description = `Hosted by ${host}.`;
  }

  if (primary.confidence < floor) {
    notes.push(`low confidence ${primary.confidence.toFixed(2)}`);
    needsReview = true;
  }
  if (!primary.title) {
    notes.push("no title");
    needsReview = true;
  }

  return {
    ...base,
    isEvent: true,
    title: primary.title ?? undefined,
    date: date ?? undefined,
    startTime: kept.startTime,
    endTime: kept.endTime,
    location: primary.location ?? undefined,
    description,
    hostOrg: host,
    confidence: primary.confidence,
    needsReview,
    reviewNotes: notes,
  };
}

/** The import-API operation for an event draft that passed review. */
export function draftToOperation(d: EventDraft): Record<string, unknown> {
  const event: Record<string, unknown> = { title: d.title, date: d.date };
  if (d.description) event.description = d.description;
  if (d.location) event.location = d.location;
  if (d.startTime) event.startTime = d.startTime;
  if (d.endTime) event.endTime = d.endTime;
  return { op: "upsert", sourceId: d.sourceId, sourceRef: d.sourceRef, event };
}
