export default function CalendarLoading() {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto w-full max-w-6xl flex-1 px-6 py-12"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="h-10 w-64 animate-pulse rounded-md bg-ink/5" />
        <div className="h-8 w-44 animate-pulse rounded-full bg-ink/5" />
      </div>
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
    </main>
  );
}
