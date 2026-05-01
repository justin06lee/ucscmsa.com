"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function CalendarError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Calendar route error:", error);
  }, [error]);
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <p className="italic text-dim">
        The calendar couldn&apos;t load right now. Please try again in a moment.
      </p>
      <Button variant="outline" onClick={reset} className="mt-4">
        Retry
      </Button>
    </main>
  );
}
