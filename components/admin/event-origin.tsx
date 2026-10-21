import { DraftBadge } from "@/components/board/draft-badge";

// Markers for where an event came from (the import API) and whether the
// whole event is cancelled. Field names match lib/db/schema.ts `events`.

const SOURCE_NAMES: Record<string, string> = { whatsapp: "WhatsApp" };

/** "Imported from WhatsApp", "Imported (<source>)", or null for admin-made events. */
export function importLabel(source: string): string | null {
  if (source === "manual") return null;
  const name = SOURCE_NAMES[source];
  return name ? `Imported from ${name}` : `Imported (${source})`;
}

/** The import source's display name, for sentences ("the WhatsApp import"). */
export function sourceName(source: string): string {
  return SOURCE_NAMES[source] ?? source;
}

export function EventBadges({
  source,
  cancelledAt,
  draft = false,
}: {
  source: string;
  cancelledAt: Date | null;
  draft?: boolean;
}) {
  const imported = importLabel(source);
  if (!imported && !cancelledAt && !draft) return null;
  return (
    <span className="inline-flex flex-wrap gap-1.5 align-middle">
      {draft ? <DraftBadge /> : null}
      {imported ? (
        <span className="rounded-full border border-ink/20 px-2 py-0.5 text-xs text-ink/75">{imported}</span>
      ) : null}
      {cancelledAt ? (
        <span className="rounded-full bg-burgundy px-2 py-0.5 text-xs font-medium text-paper">Cancelled</span>
      ) : null}
    </span>
  );
}

/** The importer's free-text origin: a link only when it is an http(s) URL. */
export function SourceRef({ value }: { value: string }) {
  if (/^https?:\/\//i.test(value)) {
    return (
      <a href={value} target="_blank" rel="noopener noreferrer" className="break-all text-burgundy underline underline-offset-2">
        {value}
      </a>
    );
  }
  return <span className="break-words">{value}</span>;
}
