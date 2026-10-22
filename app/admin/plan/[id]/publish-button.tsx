"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { publishEvent } from "../_actions";

export function PublishButton({ eventId }: { eventId: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        size="lg"
        disabled={pending}
        onClick={() => {
          setErr(null);
          start(async () => {
            const r = await publishEvent(eventId);
            if (!r.ok) setErr("Couldn't publish it. Try again.");
          });
        }}
      >
        Publish
      </Button>
      <span className="text-sm text-dim">Only admins can see it until it&apos;s published.</span>
      {err ? (
        <span role="alert" className="text-sm text-burgundy">
          {err}
        </span>
      ) : null}
    </div>
  );
}
