"use client";

import { approveNomination, cancelNomination } from "@/app/admin/_actions";
import { startTransition as later, useOptimistic, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { attempt } from "@/lib/attempt";

// The governance codes (app/admin/_governance.ts), as sentences.
export const NOMINATION_ERRORS: Record<string, string> = {
  nominee_must_sign_in_first: "They need to sign in to the site once before they can be approved.",
  would_remove_last_admin: "That would leave the site with no admins.",
  nomination_void: "This nomination no longer applies. Reload the page.",
  only_nominator_can_cancel: "Only the person who nominated can cancel it.",
  not_pending: "This was already decided. Reload the page.",
  already_approved: "You already approved this.",
  nominator_cannot_approve: "You nominated them, so your approval doesn't count.",
  cannot_nominate_self: "You can't nominate yourself.",
  target_not_found: "That admin no longer exists. Reload the page.",
};

/** Approve shows as approved the moment it's clicked, and goes back with a quiet line if the vote fails. */
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
  const [approved, setApproved] = useOptimistic(iApproved);
  const [err, setErr] = useState<string | null>(null);

  function act(run: () => Promise<unknown>, optimistic?: () => void) {
    setErr(null);
    start(async () => {
      optimistic?.();
      const r = await attempt(run);
      if (!r.ok) later(() => setErr((r.code && NOMINATION_ERRORS[r.code]) || r.error));
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!iAmNominator && (
        <Button
          size="lg"
          disabled={approved}
          aria-pressed={approved}
          onClick={() => act(() => approveNomination(nominationId), () => setApproved(true))}
        >
          {approved ? "Approved" : "Approve"}
        </Button>
      )}
      {iAmNominator && (
        <Button size="lg" variant="outline" disabled={pending} aria-busy={pending} onClick={() => act(() => cancelNomination(nominationId))}>
          {pending ? "Cancelling…" : "Cancel"}
        </Button>
      )}
      {err && (
        <span role="status" className="text-sm text-burgundy">
          {err}
        </span>
      )}
    </div>
  );
}
