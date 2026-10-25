import { Markdown } from "@/components/board/markdown";

/** Keep the original snapshot verbatim; word the old notes' arrows on screen. */
export function CardText({ source }: { source: string }) {
  return (
    <Markdown
      className="[&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center"
      source={source.replace(/\s*→\s*/g, ", then ")}
    />
  );
}
