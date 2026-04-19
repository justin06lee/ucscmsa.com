"use client";

import { approveNomination, cancelNomination } from "@/app/admin/_actions";
import { useState, useTransition } from "react";

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
        <button
          disabled={pending || iApproved}
          onClick={() =>
            start(async () => {
              const r = await approveNomination(nominationId);
              if (!r.ok) setErr(r.error ?? "failed");
            })
          }
          className="px-3 py-1 rounded-full bg-ink text-paper hover:bg-burgundy disabled:opacity-50"
        >
          {iApproved ? "Approved" : "Approve"}
        </button>
      )}
      {iAmNominator && (
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await cancelNomination(nominationId);
              if (!r.ok) setErr(r.error ?? "failed");
            })
          }
          className="px-3 py-1 rounded-full border border-ink/30 hover:bg-ink/5"
        >
          Cancel
        </button>
      )}
      {err && <span className="text-xs text-burgundy">{err}</span>}
    </div>
  );
}
