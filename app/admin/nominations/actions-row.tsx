"use client";

import { approveNomination, cancelNomination } from "@/app/admin/_actions";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

export function ActionsRow({
  nominationId,
  iAmNominator,
  iApproved,
}: {
  nominationId: string;
  iAmNominator: boolean;
  iApproved: boolean;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      {!iAmNominator && (
        <Button
          size="sm"
          disabled={pending || iApproved}
          onClick={() => {
            setErr(null);
            start(async () => {
              const r = await approveNomination(nominationId);
              if (!r.ok) setErr(r.error ?? "failed");
            });
          }}
        >
          {iApproved ? "Approved" : "Approve"}
        </Button>
      )}
      {iAmNominator && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            setErr(null);
            start(async () => {
              const r = await cancelNomination(nominationId);
              if (!r.ok) setErr(r.error ?? "failed");
            });
          }}
        >
          Cancel
        </Button>
      )}
      {err && (
        <span role="alert" className="text-xs text-burgundy">
          {err}
        </span>
      )}
    </div>
  );
}
