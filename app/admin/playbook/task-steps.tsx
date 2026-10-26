"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { attempt } from "@/lib/attempt";
import { leadLabel, type PlaybookCard } from "@/lib/playbook";
import { movePlaybookCards } from "./_card-actions";
import { CardEditor } from "./card-editor";
import { CardText } from "./card-text";
import { moveWithinTask, stepsFor, type PlaybookTask } from "./_tasks";

/** A category's steps as numbered instructions. Reordering and editing appear only after "Edit steps". */
export function TaskSteps({ task, initialCards }: { task: PlaybookTask; initialCards: PlaybookCard[] }) {
  const [cards, setCards] = useState(initialCards);
  const [previousCards, setPreviousCards] = useState(initialCards);
  if (initialCards !== previousCards) {
    setPreviousCards(initialCards);
    setCards(initialCards);
  }
  const [editMode, setEditMode] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const steps = stepsFor(cards, task);

  function move(id: string, by: -1 | 1) {
    const previous = cards;
    const next = moveWithinTask(previous, id, by);
    if (!next) return;
    setCards(next);
    setError("");
    setStatus("Saving order…");
    start(async () => {
      const r = await attempt(() => movePlaybookCards(next.map((c) => c.id), previous.map((c) => c.id)));
      if (!r.ok) {
        setCards(previous);
        setError(r.error);
        setStatus("");
      } else setStatus("Order saved.");
    });
  }

  return (
    <div className="mt-6">
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-ink/10 pb-2">
        <p className="text-sm text-dim" aria-live="polite">
          {status || (steps.length ? `${steps.length} ${steps.length === 1 ? "step" : "steps"}, in order` : "No steps yet")}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11"
          aria-pressed={editMode}
          onClick={() => {
            setEditMode(!editMode);
            setEditing(null);
            setStatus("");
          }}
        >
          {editMode ? "Done" : "Edit steps"}
        </Button>
      </div>
      {error ? <p role="alert" className="mt-3 text-sm text-burgundy">{error}</p> : null}
      <ol>
        {steps.map((c, i) =>
          editing === c.id ? (
            <li key={c.id} className="border-b border-ink/10 py-4">
              <CardEditor card={c} cards={cards} onClose={() => setEditing(null)} />
            </li>
          ) : (
            <li key={c.id} className="flex gap-3 border-b border-ink/10 py-4" data-step={c.id}>
              <span aria-hidden className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-ink/15 text-sm tabular-nums">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-medium leading-snug">{c.title}</h2>
                <p className="mt-0.5 text-sm text-dim">{leadLabel(c.daysBefore)}</p>
                {c.body ? (
                  <details className="mt-1" open={steps.length === 1}>
                    <summary className="flex min-h-11 cursor-pointer items-center text-sm text-burgundy">How to do it</summary>
                    <div className="pb-1">
                      <CardText source={c.body} />
                      {c.guideSlug ? (
                        <Link href={`/admin/playbook/${c.guideSlug}`} className="inline-flex min-h-11 items-center text-sm text-dim underline underline-offset-4 hover:text-ink">
                          Open the full guide
                        </Link>
                      ) : null}
                    </div>
                  </details>
                ) : null}
                {editMode ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="min-h-11" disabled={pending || i === 0} onClick={() => move(c.id, -1)} aria-label={`Move “${c.title}” up`}>
                      Move up
                    </Button>
                    <Button variant="outline" size="sm" className="min-h-11" disabled={pending || i === steps.length - 1} onClick={() => move(c.id, 1)} aria-label={`Move “${c.title}” down`}>
                      Move down
                    </Button>
                    <Button variant="ghost" size="sm" className="min-h-11" disabled={pending} onClick={() => setEditing(c.id)} aria-label={`Edit “${c.title}”`}>
                      Edit
                    </Button>
                  </div>
                ) : null}
              </div>
            </li>
          ),
        )}
      </ol>
      {editMode ? (
        editing === "new" ? (
          <div className="border-b border-ink/10 py-4">
            <CardEditor cards={cards} defaultTag={task.tag} onClose={() => setEditing(null)} />
          </div>
        ) : (
          <Button variant="outline" className="mt-4 min-h-11" onClick={() => setEditing("new")}>
            Add a step
          </Button>
        )
      ) : null}
    </div>
  );
}
