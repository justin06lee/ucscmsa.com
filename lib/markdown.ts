// A small markdown subset for the board's playbook guides, parsed to a tree
// that components/board/markdown.tsx renders as React elements. There is no
// raw HTML: "<script>" in a guide is just text, escaped by React like any
// other. Links are kept only when they are absolute http(s) URLs.
//
// Supported: ## and ### headings (# counts as ##), paragraphs, "-"/"*" and
// "1." lists with one level of nesting, "> " quotes, **bold**, *italic*,
// `code`, [text](https://...), bare https:// URLs, and TODO markers.

export type Inline =
  | { t: "text"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; href: string; c: Inline[] }
  | { t: "todo" };

export type ListItem = { c: Inline[]; sub?: Extract<Block, { t: "list" }> };

export type Block =
  | { t: "heading"; level: 2 | 3; c: Inline[] }
  | { t: "para"; c: Inline[] }
  | { t: "quote"; c: Inline[] }
  | { t: "list"; ordered: boolean; start: number; items: ListItem[] };

export const GUIDE_BODY_MAX = 20_000;
export const GUIDE_TITLE_MAX = 120;

/** The URL if it is an absolute http(s) URL, else null. */
export function safeHref(raw: string): string | null {
  const s = raw.trim();
  // Control characters and spaces can smuggle a scheme past naive checks.
  if (!s || /[\u0000- \u007f]/.test(s)) return null;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return s;
}

const LIST_RE = /^( *)([-*+]|\d{1,3}[.)])\s+(.*)$/;
// Every pattern here runs on admin-written text up to GUIDE_BODY_MAX, so each
// is linear or bounded: no nested or overlapping repeats that backtrack.
const HEADING_RE = /^(#{1,6})\s+(.*)$/;

/** A heading's text without its optional closing #s. */
function headingText(raw: string): string {
  const s = raw.trimEnd();
  let end = s.length;
  while (end > 0 && s[end - 1] === "#") end--;
  return end === 0 || /\s/.test(s[end - 1]) ? s.slice(0, end).trimEnd() : s;
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  let quote: string[] = [];
  let list: Extract<Block, { t: "list" }> | null = null;
  // The item that a continuation line or a nested list attaches to.
  let lastItem: { item: ListItem; text: string[] } | null = null;
  let sub: { list: Extract<Block, { t: "list" }>; last: { item: ListItem; text: string[] } } | null = null;

  const flushPara = () => {
    if (para.length) blocks.push({ t: "para", c: parseInline(para.join(" ")) });
    para = [];
  };
  const flushQuote = () => {
    if (quote.length) blocks.push({ t: "quote", c: parseInline(quote.join(" ")) });
    quote = [];
  };
  const finishItem = (x: { item: ListItem; text: string[] } | null) => {
    if (x) x.item.c = parseInline(x.text.join(" "));
  };
  const flushList = () => {
    if (sub) finishItem(sub.last);
    finishItem(lastItem);
    if (list) blocks.push(list);
    list = null;
    lastItem = null;
    sub = null;
  };
  const flushAll = () => {
    flushPara();
    flushQuote();
    flushList();
  };

  for (const raw of lines) {
    const line = raw.replace(/\t/g, "    ");
    if (!line.trim()) {
      flushPara();
      flushQuote();
      continue;
    }
    const h = HEADING_RE.exec(line);
    if (h && !line.startsWith(" ")) {
      flushAll();
      blocks.push({ t: "heading", level: h[1].length >= 3 ? 3 : 2, c: parseInline(headingText(h[2])) });
      continue;
    }
    const li = LIST_RE.exec(line);
    if (li) {
      flushPara();
      flushQuote();
      const indent = li[1].length;
      const ordered = /\d/.test(li[2]);
      const start = ordered ? parseInt(li[2], 10) : 1;
      const entry = { item: { c: [] } as ListItem, text: [li[3]] };
      if (indent >= 2 && lastItem) {
        // Nested under the last top-level item.
        if (!sub || sub.list.ordered !== ordered || lastItem.item.sub !== sub.list) {
          if (sub) finishItem(sub.last);
          const nested: Extract<Block, { t: "list" }> = { t: "list", ordered, start, items: [] };
          lastItem.item.sub = nested;
          sub = { list: nested, last: entry };
        } else {
          finishItem(sub.last);
          sub.last = entry;
        }
        sub.list.items.push(entry.item);
        continue;
      }
      if (sub) finishItem(sub.last);
      sub = null;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { t: "list", ordered, start, items: [] };
      } else {
        finishItem(lastItem);
      }
      list.items.push(entry.item);
      lastItem = entry;
      continue;
    }
    if (line.startsWith(">")) {
      flushPara();
      flushList();
      quote.push(line.replace(/^>\s?/, ""));
      continue;
    }
    if (list && /^ {2,}/.test(line)) {
      // A wrapped line of the current list item.
      (sub ? sub.last : lastItem)!.text.push(line.trim());
      continue;
    }
    flushQuote();
    flushList();
    para.push(line.trim());
  }
  flushAll();
  return blocks;
}

const URL_RE = /https?:\/\/[^\s<>]+/iy;

/** Trims trailing punctuation (and an unbalanced ")") off a bare URL. */
function trimUrl(u: string): string {
  let open = 0;
  let close = 0;
  for (const c of u) {
    if (c === "(") open++;
    else if (c === ")") close++;
  }
  let end = u.length;
  for (;;) {
    const last = u[end - 1];
    if (last && ".,;:!?'\"".includes(last)) end--;
    else if (last === ")" && open < close) {
      end--;
      close--;
    } else return u.slice(0, end);
  }
}

// [label](href): the href may hold one level of balanced parentheses, as in
// https://en.wikipedia.org/wiki/X_(Y). The two branches start with different
// characters and both repeats are bounded, so a failed match costs O(length).
const LINK_RE = /^\[([^\]\n]{0,300})\]\(((?:[^()\s]|\([^()\s]{0,2048}\)){0,2048})\)/;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let text = "";
  const pushText = () => {
    if (text) out.push({ t: "text", v: text });
    text = "";
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const rest = src.slice(i);

    if (ch === "\\" && i + 1 < src.length && /[\\`*_[\]()#>-]/.test(src[i + 1])) {
      text += src[i + 1];
      i += 2;
      continue;
    }
    if (ch === "`") {
      const end = src.indexOf("`", i + 1);
      if (end > i + 1) {
        pushText();
        out.push({ t: "code", v: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (rest.startsWith("**")) {
      const end = src.indexOf("**", i + 2);
      if (end > i + 2) {
        pushText();
        out.push({ t: "strong", c: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if (ch === "*" && src[i + 1] !== " ") {
      const end = src.indexOf("*", i + 1);
      if (end > i + 1 && src[end - 1] !== " ") {
        pushText();
        out.push({ t: "em", c: parseInline(src.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    if (ch === "[") {
      const m = LINK_RE.exec(rest);
      if (m) {
        pushText();
        const href = safeHref(m[2]);
        const label = parseInline(m[1] || m[2]);
        // An unsafe link keeps its words and loses the link.
        if (href) out.push({ t: "link", href, c: label });
        else out.push(...label);
        i += m[0].length;
        continue;
      }
    }
    if ((ch === "h" || ch === "H") && /^https?:\/\//i.test(rest) && !/[\w/]/.test(text.at(-1) ?? "")) {
      URL_RE.lastIndex = i;
      const m = URL_RE.exec(src);
      if (m) {
        const url = trimUrl(m[0]);
        const href = safeHref(url);
        if (href) {
          pushText();
          out.push({ t: "link", href, c: [{ t: "text", v: url }] });
          i += url.length;
          continue;
        }
        // Not a usable URL: the whole run stays text, so it isn't parsed
        // again from every later "http" inside it.
        text += m[0];
        i += m[0].length;
        continue;
      }
    }
    if (rest.startsWith("TODO") && !/\w/.test(text.at(-1) ?? "") && !/^TODO\w/.test(rest)) {
      pushText();
      out.push({ t: "todo" });
      i += 4;
      continue;
    }
    text += ch;
    i++;
  }
  pushText();
  return out;
}

/** Plain text of a guide, for a one-line summary. */
export function plainText(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      switch (n.t) {
        case "text":
        case "code":
          return n.v;
        case "todo":
          return "TODO";
        default:
          return plainText(n.c);
      }
    })
    .join("");
}
