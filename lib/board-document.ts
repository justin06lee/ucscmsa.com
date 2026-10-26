import { z } from "zod";
import {
  GUIDE_BODY_MAX,
  parseMarkdown,
  plainText,
  safeHref,
  type Block,
  type Inline,
} from "./markdown";

// Stored in the existing versioned body column. Legacy Markdown stays readable;
// structured documents preserve nested blocks and formatting without a lossy export.
export const DOCUMENT_PREFIX = "playbook-blocks-v1\n";
export const DOCUMENT_MAX = 200_000;
export const BLOCK_LIMIT = 250;
export const DEPTH_LIMIT = 8;
export const COLORS = [
  "default",
  "gray",
  "brown",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
] as const;
export type TextStyles = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  textColor?: string;
  backgroundColor?: string;
};
export type RichText = { type: "text"; text: string; styles: TextStyles };
export type RichInline =
  | RichText
  | { type: "link"; href: string; content: RichText[] };
export type RichBlock = {
  id?: string;
  type:
    | "paragraph"
    | "heading"
    | "bulletListItem"
    | "numberedListItem"
    | "checkListItem"
    | "quote";
  props: {
    level?: 1 | 2 | 3;
    start?: number;
    checked?: boolean;
    textAlignment?: "left" | "center" | "right" | "justify";
    textColor?: string;
    backgroundColor?: string;
  };
  content: RichInline[];
  children: RichBlock[];
};
const TYPES = new Set([
  "paragraph",
  "heading",
  "bulletListItem",
  "numberedListItem",
  "checkListItem",
  "quote",
]);
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
function validStyles(v: unknown): boolean {
  return (
    record(v) &&
    Object.entries(v).every(([key, value]) =>
      ["bold", "italic", "underline", "strike", "code"].includes(key)
        ? typeof value === "boolean"
        : ["textColor", "backgroundColor"].includes(key) &&
          COLORS.some((c) => c === value),
    )
  );
}

/** Validate iteratively before rendering: bounded depth, nodes, text and URLs. */
export function decodeDocument(source: string): RichBlock[] | null {
  if (!source.startsWith(DOCUMENT_PREFIX) || source.length > DOCUMENT_MAX)
    return null;
  let value: unknown;
  try {
    value = JSON.parse(source.slice(DOCUMENT_PREFIX.length));
  } catch {
    return null;
  }
  if (!Array.isArray(value) || !value.length) return null;
  const stack = value.map((block) => ({ block: block as unknown, depth: 1 }));
  const ids = new Set<string>();
  let count = 0,
    length = 0;
  while (stack.length) {
    const { block: b, depth } = stack.pop()!;
    if (
      ++count > BLOCK_LIMIT ||
      depth > DEPTH_LIMIT ||
      !record(b) ||
      typeof b.type !== "string" ||
      !TYPES.has(b.type)
    )
      return null;
    if (b.id !== undefined) {
      if (
        typeof b.id !== "string" ||
        !/^[\w-]{1,80}$/.test(b.id) ||
        ids.has(b.id)
      )
        return null;
      ids.add(b.id);
    }
    if (
      !record(b.props) ||
      !Array.isArray(b.content) ||
      !Array.isArray(b.children)
    )
      return null;
    for (const [key, v] of Object.entries(b.props)) {
      if (key === "level" && typeof v === "number" && [1, 2, 3].includes(v))
        continue;
      if (
        key === "start" &&
        typeof v === "number" &&
        Number.isInteger(v) &&
        v >= 1 &&
        v <= 999
      )
        continue;
      if (key === "checked" && typeof v === "boolean") continue;
      if (
        key === "textAlignment" &&
        typeof v === "string" &&
        ["left", "center", "right", "justify"].includes(v)
      )
        continue;
      if (
        ["textColor", "backgroundColor"].includes(key) &&
        COLORS.some((c) => c === v)
      )
        continue;
      return null;
    }
    const texts: unknown[] = [];
    for (const inline of b.content) {
      if (!record(inline)) return null;
      if (inline.type === "text") texts.push(inline);
      else if (
        inline.type === "link" &&
        typeof inline.href === "string" &&
        inline.href.length <= 2048 &&
        safeHref(inline.href) &&
        Array.isArray(inline.content)
      )
        texts.push(...inline.content);
      else return null;
    }
    for (const text of texts) {
      if (
        !record(text) ||
        text.type !== "text" ||
        typeof text.text !== "string" ||
        !validStyles(text.styles)
      )
        return null;
      length += text.text.length;
      if (length > GUIDE_BODY_MAX) return null;
    }
    if (b.children.length + stack.length > BLOCK_LIMIT) return null;
    for (const child of b.children)
      stack.push({ block: child, depth: depth + 1 });
  }
  return value as RichBlock[];
}
export function encodeDocument(blocks: RichBlock[]): string {
  return DOCUMENT_PREFIX + JSON.stringify(blocks);
}
export const boardBodySchema = z
  .string()
  .max(DOCUMENT_MAX, "That text is too long.")
  .refine(
    (s) =>
      s.startsWith(DOCUMENT_PREFIX)
        ? decodeDocument(s) !== null
        : s.length <= GUIDE_BODY_MAX,
    "Keep the text under 20,000 characters, with up to 250 blocks and 8 levels of subtasks. Links need a full http or https address.",
  );

/** No fetching or guessed destinations: only replace a raw URL's visible label. */
export function readableLink(href: string, context = ""): string {
  const url = new URL(href);
  if (url.hostname === "spaces.ucsc.edu") return "Spaces directory";
  if (url.hostname === "classroomreservations.ucsc.edu")
    return "Classroom reservations";
  if (url.hostname === "guides.library.ucsc.edu") return "Library study rooms";
  if (url.hostname === "docs.google.com" && url.pathname.includes("/forms/")) {
    const words = context
      .split(/https?:\/\//)[0]
      .replace(/[:\s]+$/, "")
      .trim();
    const short = words.split(" (")[0];
    return short && short.length < 70 ? `${short} form` : "Open form";
  }
  if (url.hostname === "docusign.net" || url.hostname.endsWith(".docusign.net"))
    return "DocuSign form";
  if (url.hostname === "maps.google.com" || url.hostname === "maps.app.goo.gl")
    return "Open map";
  return url.hostname.replace(/^www\./, "");
}
function convertInline(
  nodes: Inline[],
  context: string,
  styles: TextStyles = {},
): RichInline[] {
  return nodes.flatMap((n): RichInline[] => {
    if (n.t === "text") return [{ type: "text", text: n.v, styles }];
    if (n.t === "todo")
      return [
        {
          type: "text",
          text: "TODO",
          styles: { ...styles, bold: true, backgroundColor: "yellow" },
        },
      ];
    if (n.t === "code")
      return [{ type: "text", text: n.v, styles: { ...styles, code: true } }];
    if (n.t === "strong" || n.t === "em")
      return convertInline(n.c, context, {
        ...styles,
        [n.t === "strong" ? "bold" : "italic"]: true,
      });
    const label = plainText(n.c);
    const content =
      label === n.href
        ? [
            {
              type: "text" as const,
              text: readableLink(n.href, context),
              styles,
            },
          ]
        : convertInline(n.c, context, styles).filter(
            (x): x is RichText => x.type === "text",
          );
    return [{ type: "link", href: n.href, content }];
  });
}
function convertBlocks(blocks: Block[]): RichBlock[] {
  return blocks.flatMap((b): RichBlock[] => {
    if (b.t === "list")
      return b.items.map((item, i) => ({
        type: b.ordered ? "numberedListItem" : "bulletListItem",
        props: b.ordered && i === 0 && b.start !== 1 ? { start: b.start } : {},
        content: convertInline(item.c, plainText(item.c)),
        children: item.sub ? convertBlocks([item.sub]) : [],
      }));
    return [
      {
        type:
          b.t === "heading"
            ? "heading"
            : b.t === "quote"
              ? "quote"
              : "paragraph",
        props: b.t === "heading" ? { level: b.level } : {},
        content: convertInline(b.c, plainText(b.c)),
        children: [],
      },
    ];
  });
}
export function documentBlocks(source: string): RichBlock[] {
  const saved = decodeDocument(source);
  if (saved) return saved;
  if (source.startsWith(DOCUMENT_PREFIX))
    return [
      {
        type: "paragraph",
        props: {},
        content: [
          {
            type: "text",
            text: "This saved text could not be read. Restore an earlier version.",
            styles: {},
          },
        ],
        children: [],
      },
    ];
  const blocks = convertBlocks(parseMarkdown(source));
  return blocks.length
    ? blocks
    : [{ type: "paragraph", props: {}, content: [], children: [] }];
}
export function documentSummary(source: string): string {
  const blocks = documentBlocks(source);
  const b =
    blocks.find((b) => b.type !== "heading" && b.content.length) ?? blocks[0];
  return (
    b?.content
      .map((c) =>
        c.type === "text" ? c.text : c.content.map((t) => t.text).join(""),
      )
      .join("")
      .replace(/\s*→\s*/g, ", then ") || "Add the details for this step."
  );
}
