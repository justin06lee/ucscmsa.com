"use client";

import { clearRsvp, rsvp } from "@/app/calendar/_actions";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  eventId: string;
  occurrenceStart: string;
  current: "yes" | "no" | "maybe" | null;
  disabled?: boolean;
};

// What the RSVP actions' error codes mean to a visitor (app/calendar/_actions.ts).
const ERRORS: Record<string, string> = {
  login_required: "Please sign in first.",
  // A page left open past the event's end.
  event_ended: "This event has ended, so it no longer takes RSVPs.",
};

export function RsvpForm({ eventId, occurrenceStart, current, disabled }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const choices: Array<"yes" | "maybe" | "no"> = ["yes", "maybe", "no"];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {choices.map((c) => (
          <form
            key={c}
            action={(fd) => {
              fd.set("eventId", eventId);
              fd.set("occurrenceStart", occurrenceStart);
              fd.set("status", c);
              setError(null);
              startTransition(async () => {
                const res = await rsvp(fd);
                setError(res.ok ? null : res.error);
              });
            }}
          >
            <Button
              type="submit"
              variant={current === c ? "primary" : "outline"}
              size="lg"
              aria-pressed={current === c}
              disabled={pending || disabled}
            >
              {c === "yes" ? "Going" : c === "maybe" ? "Maybe" : "Can't go"}
            </Button>
          </form>
        ))}
        {current && (
          <form
            action={(fd) => {
              fd.set("eventId", eventId);
              fd.set("occurrenceStart", occurrenceStart);
              setError(null);
              startTransition(async () => {
                const res = await clearRsvp(fd);
                setError(res.ok ? null : res.error);
              });
            }}
          >
            <Button
              type="submit"
              variant="ghost"
              size="lg"
              disabled={pending || disabled}
            >
              Clear
            </Button>
          </form>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-burgundy">
          {ERRORS[error] ?? "Something went wrong."}
        </p>
      )}
    </div>
  );
}
