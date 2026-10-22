"use client";

import { clearRsvp, rsvp } from "@/app/calendar/_actions";
import { useOptimistic, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { attempt } from "@/lib/attempt";

type Choice = "yes" | "no" | "maybe";

type Props = {
  eventId: string;
  occurrenceStart: string;
  current: Choice | null;
  disabled?: boolean;
};

// What the RSVP actions' error codes mean to a visitor (app/calendar/_actions.ts).
const ERRORS: Record<string, string> = {
  login_required: "Please sign in first.",
  // A page left open past the event's end.
  event_ended: "This event has ended, so it no longer takes RSVPs.",
};

/**
 * Going / Maybe / Can't go, and Clear. The choice shows the moment it's
 * tapped and "Saving…" until the server has it; if the save fails, the
 * previous answer comes back with a quiet line saying so.
 */
export function RsvpForm({ eventId, occurrenceStart, current, disabled }: Props) {
  const [pending, startTransition] = useTransition();
  const [shown, show] = useOptimistic(current);
  const [error, setError] = useState<string | null>(null);
  const choices: Choice[] = ["yes", "maybe", "no"];

  function choose(next: Choice | null) {
    setError(null);
    startTransition(async () => {
      show(next);
      const fd = new FormData();
      fd.set("eventId", eventId);
      fd.set("occurrenceStart", occurrenceStart);
      if (next) fd.set("status", next);
      const res = await attempt(() => (next ? rsvp(fd) : clearRsvp(fd)));
      if (!res.ok) startTransition(() => setError((res.code && ERRORS[res.code]) || res.error));
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2" data-pending={pending ? "" : undefined}>
        {choices.map((c) => (
          <Button
            key={c}
            type="button"
            onClick={() => choose(c)}
            variant={shown === c ? "primary" : "outline"}
            size="lg"
            aria-pressed={shown === c}
            disabled={disabled}
          >
            {c === "yes" ? "Going" : c === "maybe" ? "Maybe" : "Can't go"}
          </Button>
        ))}
        {shown && (
          <Button type="button" onClick={() => choose(null)} variant="ghost" size="lg" disabled={disabled}>
            Clear
          </Button>
        )}
        <span role="status" className="text-sm text-dim">
          {pending ? "Saving…" : ""}
        </span>
      </div>
      {error && <p className="mt-2 text-sm text-burgundy">{error}</p>}
    </div>
  );
}
