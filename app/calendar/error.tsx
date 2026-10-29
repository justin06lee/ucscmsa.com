"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function CalendarError({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Calendar route error:", error);
  }, [error]);
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <p className="italic text-dim">
        The calendar couldn&apos;t load right now. Please try again in a moment.
      </p>
      <Button variant="ghost" onClick={() => retry()} className="mt-4 -ml-4 min-h-11">
        Retry
      </Button>
    </main>
  );
}
