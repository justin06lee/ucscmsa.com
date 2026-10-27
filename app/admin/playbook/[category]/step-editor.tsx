"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Step } from "@/lib/playbook-db";
import { addStepAction, archiveStepAction, moveStepAction, saveStepAction } from "../_actions";
import { ErrorLine, useAction } from "../category-editor";

type Fields = { title: string; body: string; whenNote: string; leadDays: string; formLabel: string; formUrl: string };

const EMPTY: Fields = { title: "", body: "", whenNote: "", leadDays: "", formLabel: "", formUrl: "" };

function fieldsOf(s: Step): Fields {
  return {
    title: s.title,
    body: s.body,
    whenNote: s.whenNote,
    leadDays: s.leadDays == null ? "" : String(s.leadDays),
    formLabel: s.formLabel,
    formUrl: s.formUrl,
  };
}

function StepFields({ id, value, onChange }: { id: string; value: Fields; onChange: (f: Fields) => void }) {
  const set = (k: keyof Fields) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  const label = "mt-3 block text-sm text-dim";
  return (
    <>
      <label className="block text-sm text-dim" htmlFor={`${id}-title`}>
        Title
      </label>
      <Input id={`${id}-title`} className="mt-1 text-base" value={value.title} onChange={set("title")} />
      <label className={label} htmlFor={`${id}-body`}>
        Instructions
      </label>
      <Textarea id={`${id}-body`} className="mt-1 text-base" rows={6} value={value.body} onChange={set("body")} />
      <p className="mt-1 text-xs text-dim">Plain text. Start a line with a dash for a list. Links work as they are.</p>
      <label className={label} htmlFor={`${id}-when`}>
        When to skip it, or when it applies
      </label>
      <Input
        id={`${id}-when`}
        className="mt-1 text-base"
        placeholder="Skip if there's no food"
        value={value.whenNote}
        onChange={set("whenNote")}
      />
      <label className={label} htmlFor={`${id}-lead`}>
        Days before the event
      </label>
      <Input
        id={`${id}-lead`}
        className="mt-1 max-w-40 text-base"
        inputMode="numeric"
        placeholder="7"
        value={value.leadDays}
        onChange={set("leadDays")}
      />
      <p className="mt-1 text-xs text-dim">0 is the day of the event. A minus number is after it. Leave empty for no timing.</p>
      <label className={label} htmlFor={`${id}-form-label`}>
        Form name
      </label>
      <Input
        id={`${id}-form-label`}
        className="mt-1 text-base"
        placeholder="Event Proposal form"
        value={value.formLabel}
        onChange={set("formLabel")}
      />
      <label className={label} htmlFor={`${id}-form-url`}>
        Form link
      </label>
      <Input
        id={`${id}-form-url`}
        className="mt-1 text-base"
        type="url"
        inputMode="url"
        placeholder="https://"
        value={value.formUrl}
        onChange={set("formUrl")}
      />
    </>
  );
}

function StepRow({ step, n, first, last }: { step: Step; n: number; first: boolean; last: boolean }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(fieldsOf(step));
  const { pending, error, run } = useAction();
  const changed = JSON.stringify(value) !== JSON.stringify(fieldsOf(step));
  const ghost = { type: "button" as const, variant: "ghost" as const, size: "sm" as const, className: "min-h-11" };
  return (
    <li className="rounded-xl border border-ink/10 px-4 py-3" data-testid="step-edit-row">
      <p className="font-medium">
        <span className="text-dim tabular-nums">{n}.</span> {step.title}
      </p>
      {open ? (
        <div className="mt-3">
          <StepFields id={step.id} value={value} onChange={setValue} />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="min-h-11"
              disabled={pending || !changed || !value.title.trim()}
              onClick={() => run(() => saveStepAction({ id: step.id, revision: step.revision, ...value }))}
            >
              {pending ? "Saving" : "Save"}
            </Button>
            <Button
              {...ghost}
              disabled={pending}
              onClick={() => {
                setValue(fieldsOf(step));
                setOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              {...ghost}
              className="ml-auto min-h-11 text-burgundy"
              disabled={pending}
              onClick={() => run(() => archiveStepAction({ id: step.id, archived: true }))}
            >
              Remove step
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => setOpen(true)}>
            Edit
          </Button>
          <Button {...ghost} disabled={pending || first} onClick={() => run(() => moveStepAction({ id: step.id, dir: -1 }))}>
            Move up
          </Button>
          <Button {...ghost} disabled={pending || last} onClick={() => run(() => moveStepAction({ id: step.id, dir: 1 }))}>
            Move down
          </Button>
        </div>
      )}
      <ErrorLine error={error} />
    </li>
  );
}

function AddStep({ categoryId }: { categoryId: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(EMPTY);
  const { pending, error, run } = useAction();
  if (!open) {
    return (
      <Button type="button" variant="outline" className="mt-6 min-h-11" onClick={() => setOpen(true)}>
        Add a step
      </Button>
    );
  }
  return (
    <form
      className="mt-6 rounded-xl border border-ink/20 px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => addStepAction({ categoryId, ...value }),
          () => {
            setValue(EMPTY);
            setOpen(false);
          },
        );
      }}
    >
      <h2 className="mb-2 text-lg font-medium">New step</h2>
      <StepFields id="new-step" value={value} onChange={setValue} />
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="submit" size="sm" className="min-h-11" disabled={pending || !value.title.trim()}>
          {pending ? "Adding" : "Add step"}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      <ErrorLine error={error} />
    </form>
  );
}

export function StepEditor({ categoryId, steps, removed }: { categoryId: string; steps: Step[]; removed: Step[] }) {
  const { pending, error, run } = useAction();
  return (
    <div>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <StepRow
            key={`${s.id}-${s.revision}`}
            step={s}
            n={i + 1}
            first={i === 0}
            last={i === steps.length - 1}
          />
        ))}
      </ol>
      <AddStep categoryId={categoryId} />
      {removed.length ? (
        <section className="mt-8 border-t border-ink/10 pt-4">
          <h2 className="text-lg font-medium">Removed steps</h2>
          <ul className="mt-2">
            {removed.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 text-dim">{s.title}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11"
                  disabled={pending}
                  onClick={() => run(() => archiveStepAction({ id: s.id, archived: false }))}
                >
                  Restore
                </Button>
              </li>
            ))}
          </ul>
          <ErrorLine error={error} />
        </section>
      ) : null}
    </div>
  );
}
