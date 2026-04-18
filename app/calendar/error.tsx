"use client";

export default function CalendarError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="max-w-6xl mx-auto px-6 py-12 w-full flex-1">
      <p className="text-dim italic">
        The calendar couldn&apos;t load right now. Please try again in a moment.
      </p>
      <button
        onClick={reset}
        className="mt-4 inline-flex items-center rounded-full border border-ink px-4 py-2 text-ink hover:bg-ink hover:text-paper transition-colors"
      >
        Retry
      </button>
    </main>
  );
}
