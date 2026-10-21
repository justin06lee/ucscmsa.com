import { Fragment } from "react";
import { parseMarkdown, type Block, type Inline } from "@/lib/markdown";

// Renders a playbook guide. Everything goes through React elements, so text is
// always escaped; lib/markdown.ts only ever produces http(s) links.

function Inlines({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.t) {
          case "text":
            return <Fragment key={i}>{n.v}</Fragment>;
          case "strong":
            return (
              <strong key={i} className="font-semibold">
                <Inlines nodes={n.c} />
              </strong>
            );
          case "em":
            return (
              <em key={i}>
                <Inlines nodes={n.c} />
              </em>
            );
          case "code":
            return (
              <code key={i} className="rounded bg-ink/5 px-1 py-0.5 text-[0.9em]">
                {n.v}
              </code>
            );
          case "link":
            return (
              <a
                key={i}
                href={n.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-burgundy underline decoration-burgundy/40 underline-offset-2 [overflow-wrap:anywhere] hover:decoration-burgundy"
              >
                <Inlines nodes={n.c} />
              </a>
            );
          case "todo":
            return (
              <span
                key={i}
                className="rounded bg-burgundy/10 px-1 text-[0.85em] font-semibold tracking-wide text-burgundy"
              >
                TODO
              </span>
            );
        }
      })}
    </>
  );
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.t) {
          case "heading":
            return b.level === 2 ? (
              <h2 key={i} className="mt-8 text-xl first:mt-0">
                <Inlines nodes={b.c} />
              </h2>
            ) : (
              <h3 key={i} className="mt-6 font-medium first:mt-0">
                <Inlines nodes={b.c} />
              </h3>
            );
          case "para":
            return (
              <p key={i} className="mt-3 first:mt-0">
                <Inlines nodes={b.c} />
              </p>
            );
          case "quote":
            return (
              <blockquote key={i} className="mt-3 border-l-2 border-burgundy/40 pl-3 text-ink/80 first:mt-0">
                <Inlines nodes={b.c} />
              </blockquote>
            );
          case "list":
            return <List key={i} list={b} />;
        }
      })}
    </>
  );
}

function List({ list, nested = false }: { list: Extract<Block, { t: "list" }>; nested?: boolean }) {
  const Tag = list.ordered ? "ol" : "ul";
  return (
    <Tag
      start={list.ordered && list.start !== 1 ? list.start : undefined}
      className={`${nested ? "mt-2" : "mt-3 first:mt-0"} grid gap-2 pl-6 ${
        list.ordered ? "list-decimal marker:text-dim" : "list-disc marker:text-ink/30"
      }`}
    >
      {list.items.map((item, i) => (
        <li key={i} className="pl-1">
          <Inlines nodes={item.c} />
          {item.sub ? <List list={item.sub} nested /> : null}
        </li>
      ))}
    </Tag>
  );
}

export function Markdown({ source, className = "" }: { source: string; className?: string }) {
  return (
    <div className={`text-base leading-relaxed [overflow-wrap:anywhere] ${className}`}>
      <Blocks blocks={parseMarkdown(source)} />
    </div>
  );
}
