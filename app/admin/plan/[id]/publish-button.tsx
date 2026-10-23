"use client";

import { startTransition as later, useState, useTransition } from "react";
import { attempt } from "@/lib/attempt";
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
        aria-busy={pending}
        onClick={() => {
          setErr(null);
          start(async () => {
            const r = await attempt(() => publishEvent(eventId));
            if (!r.ok) later(() => setErr(r.error));
          });
        }}
      >
        {pending ? "Publishing…" : "Publish"}
      </Button>
      <span className="text-sm text-dim">Only admins can see it until it&apos;s published.</span>
      {err ? (
        <span role="status" className="text-sm text-burgundy">
          {err}
        </span>
      ) : null}
    </div>
  );
}
