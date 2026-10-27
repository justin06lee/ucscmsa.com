import { LinkifiedText } from "@/components/linkified-text";

/** "1 week before", "On the day", "2 weeks after"; null when the step has no timing. */
export function timingLabel(leadDays: number | null | undefined): string | null {
  if (leadDays == null) return null;
  if (leadDays === 0) return "On the day";
  const n = Math.abs(leadDays);
  const side = leadDays > 0 ? "before" : "after";
  if (n % 7 === 0) {
    const w = n / 7;
    return `${w} ${w === 1 ? "week" : "weeks"} ${side}`;
  }
  return `${n} ${n === 1 ? "day" : "days"} ${side}`;
}

type Block = { kind: "p"; lines: string[] } | { kind: "ul"; items: string[] };

/** Plain text to blocks: blank lines split paragraphs, "- " lines make a list. */
export function textBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of text.replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
    let current: Block | null = null;
    for (const raw of chunk.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const bullet = /^[-*•]\s+(.*)$/.exec(line);
      if (bullet) {
        if (current?.kind !== "ul") blocks.push((current = { kind: "ul", items: [] }));
        current.items.push(bullet[1]);
      } else {
        if (current?.kind !== "p") blocks.push((current = { kind: "p", lines: [] }));
        current.lines.push(line);
      }
    }
  }
  return blocks;
}

/** A step's instructions as plain paragraphs and lists, links opening in a new tab. */
export function StepText({ text, className = "" }: { text: string; className?: string }) {
  const blocks = textBlocks(text);
  if (!blocks.length) return null;
  return (
    <div className={`space-y-2 leading-relaxed ${className}`}>
      {blocks.map((b, i) =>
        b.kind === "ul" ? (
          <ul key={i} className="list-disc space-y-1 pl-5">
            {b.items.map((item, j) => (
              <li key={j}>
                <LinkifiedText text={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            {b.lines.map((line, j) => (
              <span key={j}>
                {j > 0 ? <br /> : null}
                <LinkifiedText text={line} />
              </span>
            ))}
          </p>
        ),
      )}
    </div>
  );
}

/** The step's form as a button-looking link, opening in a new tab. */
export function FormLink({ label, url }: { label: string; url: string }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center justify-center rounded-full border border-ink/30 px-4 text-sm font-medium transition-colors hover:bg-ink/5"
    >
      {label || "Open the form"}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
