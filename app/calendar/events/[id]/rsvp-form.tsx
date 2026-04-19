"use client";

import { rsvp } from "@/app/calendar/_actions";
import { useState, useTransition } from "react";

type Props = {
  eventId: string;
  occurrenceStart: string;
  current: "yes" | "no" | "maybe" | null;
  disabled?: boolean;
};

export function RsvpForm({ eventId, occurrenceStart, current, disabled }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const choices: Array<"yes" | "maybe" | "no"> = ["yes", "maybe", "no"];

  return (
    <div>
      <div className="flex gap-2">
        {choices.map((c) => (
          <form
            key={c}
            action={(fd) => {
              fd.set("eventId", eventId);
              fd.set("occurrenceStart", occurrenceStart);
              fd.set("status", c);
              startTransition(async () => {
                const res = await rsvp(fd);
                setError(res.ok ? null : res.error);
              });
            }}
          >
            <button
              type="submit"
              disabled={pending || disabled}
              className={`px-4 py-2 rounded-full border text-sm capitalize ${
                current === c
                  ? "bg-ink text-paper border-ink"
                  : "border-ink/30 hover:bg-ink/5"
              } disabled:opacity-50`}
            >
              {c === "yes" ? "Going" : c === "maybe" ? "Maybe" : "Can't go"}
            </button>
          </form>
        ))}
      </div>
      {error && (
        <p className="mt-2 text-sm text-burgundy">
          {error === "login_required" ? "Please sign in first." : "Something went wrong."}
        </p>
      )}
    </div>
  );
}
