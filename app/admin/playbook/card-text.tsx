import { Markdown } from "@/components/board/markdown";

/** Card body as rich text; RichDocument words arrows on screen, never in links. */
export function CardText({ source }: { source: string }) {
  return (
    <Markdown
      compactLinks
      className="[&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center"
      source={source}
    />
  );
}
