// Free text with its http(s) URLs as links, e.g. an RSVP form in an event
// description, opening in a new tab like every off-site link. Each link shows
// a short label (linkLabel) instead of the raw URL, which stays in its title. The text is never treated as HTML: it is split into plain
// strings and URLs, and React escapes both. Any other scheme (javascript:,
// data:, mailto:, ...) stays text.

export type TextPart = { kind: "text"; text: string } | { kind: "link"; text: string; href: string };

// Runs to the next space or a character that can't sit unencoded in a URL.
const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;
// Sentence punctuation that ends a URL in prose more often than it belongs to it.
const TRAILING = new Set([".", ",", ";", ":", "!", "?", "…", "*"]);
const CLOSERS: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

function count(s: string, ch: string): number {
  return s.split(ch).length - 1;
}

/** Drops trailing punctuation, and closing brackets the URL didn't open. */
function trimTrailing(url: string): string {
  let end = url.length;
  for (;;) {
    const c = url[end - 1];
    const opener = CLOSERS[c];
    if (TRAILING.has(c)) end--;
    else if (opener && count(url.slice(0, end), c) > count(url.slice(0, end), opener)) end--;
    else break;
  }
  return url.slice(0, end);
}

function isWebUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return (u.protocol === "http:" || u.protocol === "https:") && /[a-z0-9]/i.test(u.hostname);
  } catch {
    return false;
  }
}

export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = [];
  const pushText = (s: string) => {
    if (!s) return;
    const prev = parts.at(-1);
    if (prev?.kind === "text") prev.text += s;
    else parts.push({ kind: "text", text: s });
  };
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index;
    // "xhttps://..." is part of a word, not a URL.
    if (start > 0 && /[\p{L}\p{N}_]/u.test(text[start - 1])) continue;
    const url = trimTrailing(m[0]);
    if (!isWebUrl(url)) continue;
    pushText(text.slice(last, start));
    parts.push({ kind: "link", text: url, href: url });
    last = start + url.length;
  }
  pushText(text.slice(last));
  return parts;
}

// Well-known places, named the way people say them. Matched on host, then
// on path, so a label never claims more than the URL shows.
const KNOWN: { host: RegExp; path?: RegExp; label: string }[] = [
  { host: /^forms\.gle$/, label: "Google Form" },
  { host: /^docs\.google\.com$/, path: /^\/forms\//, label: "Google Form" },
  { host: /^docs\.google\.com$/, path: /^\/document\//, label: "Google Doc" },
  { host: /^docs\.google\.com$/, path: /^\/spreadsheets\//, label: "Google Sheet" },
  { host: /^drive\.google\.com$/, label: "Google Drive" },
  { host: /^maps\.app\.goo\.gl$/, label: "Map" },
  { host: /^(www\.)?google\.com$/, path: /^\/maps/, label: "Map" },
  { host: /^(www\.)?instagram\.com$/, label: "Instagram" },
  { host: /^chat\.whatsapp\.com$/, label: "WhatsApp group" },
  { host: /^(www\.)?(youtube\.com|youtu\.be)$/, label: "YouTube" },
  { host: /^(lu\.ma|luma\.com)$/, label: "Luma page" },
];

/**
 * The words a link shows: a known place by name ("Google Form"), else the
 * site's domain ("eventbrite.com"). A bare 40-character URL reads as noise in
 * a description, and the domain still says honestly where the link goes.
 */
export function linkLabel(href: string): string {
  const u = new URL(href);
  const host = u.hostname.toLowerCase();
  const known = KNOWN.find((k) => k.host.test(host) && (!k.path || k.path.test(u.pathname)));
  return known ? known.label : host.replace(/^www\./, "");
}

export function LinkifiedText({ text }: { text: string }) {
  return linkify(text).map((p, i) =>
    p.kind === "link" ? (
      <a
        key={i}
        href={p.href}
        title={p.href}
        target="_blank"
        rel="noopener noreferrer nofollow ugc"
        className="wrap-anywhere text-burgundy underline underline-offset-2 hover:text-ink"
      >
        {linkLabel(p.href)}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    ) : (
      <span key={i}>{p.text}</span>
    ),
  );
}
