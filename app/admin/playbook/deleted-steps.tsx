"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { attempt } from "@/lib/attempt";
import type { PlaybookCard } from "@/lib/playbook";
import { loadCardHistory, restorePlaybookCard } from "./_card-actions";

/** Deleted steps, tucked away at the foot of the playbook, each with a restore button. */
export function DeletedSteps({ archived }: { archived: PlaybookCard[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  if (!archived.length) return null;
  return (
    <details className="mt-8 border-t border-ink/10 pt-3">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm text-dim">
        Deleted steps · {archived.length}
      </summary>
      {error ? <p role="alert" className="my-2 text-sm text-burgundy">{error}</p> : null}
      {archived.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 py-2">
          <p className="text-sm">{c.title}</p>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={pending}
            onClick={() => {
              setError("");
              start(async () => {
                const history = await attempt(() => loadCardHistory(c.id));
                if (!history.ok) {
                  setError(history.error);
                  return;
                }
                if (!history.value.ok || !history.value.versions[0]) {
                  setError("No saved version was found.");
                  return;
                }
                const versionId = history.value.versions[0].id;
                const r = await attempt(() => restorePlaybookCard(c.id, versionId, c.revision));
                if (!r.ok) setError(r.error);
              });
            }}
          >
            Restore step
          </Button>
        </div>
      ))}
    </details>
  );
}
