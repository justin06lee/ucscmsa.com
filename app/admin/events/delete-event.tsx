"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteEvent } from "@/app/admin/_actions";
import { Button } from "@/components/ui/button";
import { attempt } from "@/lib/attempt";

/** The edit page's Delete: asks first, says "Deleting…", then back to the list. */
export function DeleteEvent({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function remove() {
    setError(null);
    start(async () => {
      const result = await attempt(() => deleteEvent(eventId));
      if (result.ok) start(() => router.push("/admin"));
      else start(() => setError(result.error));
    });
  }

  return (
    <div className="mt-8">
      {confirming ? (
        <div role="group" aria-label="Delete this event?" className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-burgundy">Delete this event for good?</span>
          <Button type="button" variant="danger" size="lg" onClick={remove} disabled={pending} aria-busy={pending}>
            {pending ? "Deleting…" : "Delete"}
          </Button>
          <Button type="button" variant="ghost" size="lg" onClick={() => setConfirming(false)} disabled={pending}>
            Keep
          </Button>
        </div>
      ) : (
        <Button type="button" variant="danger-outline" size="lg" onClick={() => setConfirming(true)}>
          Delete event
        </Button>
      )}
      {error ? <p role="status" className="mt-2 text-sm text-burgundy">{error}</p> : null}
    </div>
  );
}
