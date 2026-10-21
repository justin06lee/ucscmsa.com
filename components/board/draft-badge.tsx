/** Marks an event the public can't see yet. */
export function DraftBadge() {
  return (
    <span className="rounded-full border border-dashed border-ink/30 px-2 py-0.5 text-xs text-ink/75">Draft</span>
  );
}
