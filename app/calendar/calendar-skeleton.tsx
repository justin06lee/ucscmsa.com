// Placeholder for the calendar view while its events and prayer times load.
// The title bar above it is already real (see page.tsx).
export function CalendarSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="grid gap-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="h-12 animate-pulse rounded-md bg-ink/5"
            style={{ animationDelay: `${i * 40}ms` }}
          />
        ))}
      </div>
      <span className="sr-only">Loading calendar</span>
    </div>
  );
}
