import { Fragment, type CSSProperties } from "react";
import {
  documentBlocks,
  type RichBlock,
  type RichInline,
  type RichText,
} from "@/lib/board-document";

const colors: Record<string, string> = {
  gray: "#67645e",
  brown: "#795548",
  red: "#8a2638",
  orange: "#9b4b15",
  yellow: "#786000",
  green: "#316646",
  blue: "#245b95",
  purple: "#704a8c",
  pink: "#a63772",
};
function Text({ run }: { run: RichText }) {
  let content = <>{run.text.replace(/\s*→\s*/g, ", then ")}</>;
  if (run.styles.bold) content = <strong>{content}</strong>;
  if (run.styles.italic) content = <em>{content}</em>;
  if (run.styles.underline) content = <u>{content}</u>;
  if (run.styles.strike) content = <s>{content}</s>;
  if (run.styles.code)
    content = <code className="rounded bg-ink/5 px-1">{content}</code>;
  return (
    <span
      style={{
        color: colors[run.styles.textColor ?? ""],
        backgroundColor: colors[run.styles.backgroundColor ?? ""]
          ? `${colors[run.styles.backgroundColor!]}20`
          : undefined,
      }}
    >
      {content}
    </span>
  );
}
function Inlines({ content }: { content: RichInline[] }) {
  return content.map((n, i) =>
    n.type === "text" ? (
      <Text key={i} run={n} />
    ) : (
      <a
        key={i}
        href={n.href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 max-w-full items-center rounded-[2px] bg-burgundy/7 px-2 py-1 font-medium text-burgundy decoration-burgundy/30 underline-offset-4 hover:bg-burgundy/12 hover:underline [overflow-wrap:anywhere]"
      >
        <span>
          {n.content.map((run, j) => (
            <Text key={j} run={run} />
          ))}
        </span>
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    ),
  );
}
function BlockBody({ block: b }: { block: RichBlock }) {
  const style: CSSProperties = {
    textAlign: b.props.textAlignment,
    color: colors[b.props.textColor ?? ""],
    backgroundColor: colors[b.props.backgroundColor ?? ""]
      ? `${colors[b.props.backgroundColor!]}20`
      : undefined,
    whiteSpace: "pre-wrap",
  };
  const content = <Inlines content={b.content} />;
  if (b.type === "heading")
    return b.props.level === 3 ? (
      <h3 className="mt-5 font-semibold" style={style}>
        {content}
      </h3>
    ) : (
      <h2 className="mt-6 text-xl" style={style}>
        {content}
      </h2>
    );
  if (b.type === "quote")
    return (
      <blockquote
        className="border-l-2 border-burgundy/30 pl-4 text-dim"
        style={style}
      >
        {content}
      </blockquote>
    );
  if (b.type === "checkListItem")
    return (
      <div className="flex items-baseline gap-2" style={style}>
        <span aria-label={b.props.checked ? "Checked" : "Unchecked"}>
          {b.props.checked ? "☑" : "☐"}
        </span>
        <span>{content}</span>
      </div>
    );
  return <div style={style}>{content}</div>;
}
function Blocks({ blocks }: { blocks: RichBlock[] }) {
  const groups: RichBlock[][] = [];
  for (const b of blocks) {
    const last = groups.at(-1);
    if (
      last &&
      ["bulletListItem", "numberedListItem"].includes(b.type) &&
      last[0].type === b.type &&
      !b.props.start
    )
      last.push(b);
    else groups.push([b]);
  }
  return groups.map((group, i) => {
    const type = group[0].type;
    if (type === "bulletListItem" || type === "numberedListItem") {
      const Tag = type === "numberedListItem" ? "ol" : "ul";
      return (
        <Tag
          key={i}
          start={type === "numberedListItem" ? group[0].props.start : undefined}
          className={`grid gap-3 pl-6 ${type === "numberedListItem" ? "list-decimal" : "list-disc"} marker:text-dim`}
        >
          {group.map((b, j) => (
            <li key={j} className="pl-1">
              <BlockBody block={b} />
              {b.children.length ? (
                <div className="mt-3">
                  <Blocks blocks={b.children} />
                </div>
              ) : null}
            </li>
          ))}
        </Tag>
      );
    }
    return (
      <Fragment key={i}>
        {group.map((b, j) => (
          <div key={j}>
            <BlockBody block={b} />
            {b.children.length ? (
              <div className="mt-3 grid gap-3 border-l border-ink/15 pl-4">
                <Blocks blocks={b.children} />
              </div>
            ) : null}
          </div>
        ))}
      </Fragment>
    );
  });
}
export function RichDocument({ source }: { source: string }) {
  return (
    <div className="grid gap-3 text-base leading-relaxed [overflow-wrap:anywhere]">
      <Blocks blocks={documentBlocks(source)} />
    </div>
  );
}
