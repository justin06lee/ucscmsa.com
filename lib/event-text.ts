import type { EventLink } from "./event-rules";

// How an event's description and links read on the site: the "Hosted by"
// line of a collab, the one-line summary on cards, which link is the main
// action, and the map link for its place.

/**
 * Splits off the "Hosted by <org>." line the import opens collab events'
 * descriptions with, so the page can show it on its own and cards can skip
 * it. Everything else is the body, as written.
 */
export function splitHostedBy(description: string): { hostedBy: string | null; body: string } {
  const text = description.replace(/\r\n?/g, "\n").trimStart();
  const lead = /^hosted by\s+/i.exec(text);
  if (!lead) return { hostedBy: null, body: description.trim() };
  const lineEnd = text.includes("\n") ? text.indexOf("\n") : text.length;
  const line = text.slice(0, lineEnd);
  const stop = line.search(/\.(\s|$)/);
  const end = stop === -1 ? line.length : stop;
  const hostedBy = line.slice(lead[0].length, end).trim();
  if (!hostedBy) return { hostedBy: null, body: description.trim() };
  return { hostedBy, body: (line.slice(end + 1) + text.slice(lineEnd)).trim() };
}

const URL_RE = /\bhttps?:\/\/\S+/gi;

/**
 * One line for event cards: the first paragraph of the description that
 * still says something once the "Hosted by" line and URLs are gone, cut at a
 * word under `max` characters.
 */
export function cardSummary(description: string | null | undefined, max = 100): string {
  if (!description) return "";
  const { body } = splitHostedBy(description);
  for (const para of body.split(/\n\s*\n/)) {
    const text = para
      .split("\n")
      .map((l) => l.replace(URL_RE, "").replace(/\s+/g, " ").trim())
      // A line that only introduced a link ("RSVP here:") says nothing alone.
      .filter((l) => l && !/[:\-–—]$/.test(l) && /[\p{L}\p{N}]/u.test(l))
      .join(" ");
    if (text) return truncate(text, max);
  }
  return "";
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  // Cut at the last whole word: the one ending at the cut counts if a space follows.
  const space = /\s/.test(text[max - 1]) ? cut.length : cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.\-–—]+$/, "")}…`;
}

/**
 * The event page's main action and the rest: the first RSVP link, else the
 * first form, is the button; map links go to the place line instead.
 */
export function splitLinks(links: EventLink[]): {
  primary: EventLink | null;
  map: EventLink | null;
  secondary: EventLink[];
} {
  const primary = links.find((l) => l.kind === "rsvp") ?? links.find((l) => l.kind === "form") ?? null;
  const map = links.find((l) => l.kind === "map") ?? null;
  return { primary, map, secondary: links.filter((l) => l !== primary && l !== map) };
}

/**
 * A Google Maps search for a place as written. No API or key: just the
 * public search URL. Places that don't name the city get Santa Cruz added,
 * so "Cowell College" finds the right one.
 */
export function mapSearchUrl(location: string): string {
  const q = /santa cruz/i.test(location) ? location : `${location}, Santa Cruz, CA`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
