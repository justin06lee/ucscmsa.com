"use client";

import { useState, useTransition } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { FormLink, StepText } from "@/components/playbook/step-text";
import { formatDay } from "@/lib/planning";
import type { MyStep } from "@/lib/step-owners";
import { toggleItemAction } from "../plan/_actions";
import { setEmailsAction } from "./_actions";

const key = (s: MyStep) => `${s.timelineId}:${s.item.id}`;

function dueLabel(due: string, today: string) {
  if (due < today) return { text: `Overdue, was due ${formatDay(due)}`, urgent: true };
  if (due === today) return { text: "Due today", urgent: true };
  return { text: `Due ${formatDay(due)}`, urgent: false };
}

export function MySteps({ steps, today, emailsOn }: { steps: MyStep[]; today: string; emailsOn: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [emails, setEmails] = useState(emailsOn);
  const shown = steps.map((s) => (key(s) in done ? { ...s, item: { ...s.item, done: done[key(s)] } } : s));
  const open = shown.filter((s) => !s.item.done);
  const finished = shown.filter((s) => s.item.done);
  const [next, ...later] = open;

  function toggle(s: MyStep, value: boolean) {
    setError(null);
    setDone((d) => ({ ...d, [key(s)]: value }));
    start(async () => {
      try {
        const res = await toggleItemAction({ id: s.timelineId, itemId: s.item.id, done: value });
        if (!res.ok) throw new Error();
      } catch {
        setDone((d) => ({ ...d, [key(s)]: !value }));
        setError("That didn't save. Try again.");
      }
    });
  }

  function card(s: MyStep, lead: boolean) {
    const due = dueLabel(s.item.due, today);
    return (
      <li
        key={key(s)}
        data-testid="my-step"
        className={`flex gap-2 rounded-xl border px-3 py-3 ${
          s.item.done ? "border-ink/5 bg-ink/[0.02]" : lead ? "border-ink/30" : "border-ink/10"
        }`}
      >
        <div className="-ml-1 shrink-0">
          <Checkbox
            aria-label={`Done: ${s.item.title}`}
            className="min-w-11 justify-center"
            checked={s.item.done}
            onChange={(e) => toggle(s, e.target.checked)}
          />
        </div>
        <div className="min-w-0 flex-1 py-2">
          <p className={`font-medium leading-snug ${lead ? "text-lg" : ""} ${s.item.done ? "text-dim line-through decoration-ink/30" : ""}`}>
            {s.item.title}
          </p>
          <p className={`mt-1 text-sm ${due.urgent && !s.item.done ? "text-burgundy" : "text-dim"}`}>
            {s.item.done ? "Done" : due.text}
          </p>
          <p className="mt-0.5 text-sm text-dim">
            {s.timelineTitle} · {formatDay(s.eventDate)} · from {s.ownerName}
          </p>
          {s.item.whenNote ? <p className="mt-1 text-sm italic text-dim">{s.item.whenNote}</p> : null}
          {s.item.formUrl && !s.item.done ? (
            <div className="mt-2">
              <FormLink label={s.item.formLabel} url={s.item.formUrl} />
            </div>
          ) : null}
          {s.item.body ? (
            <details className="mt-1" open={lead && !s.item.done}>
              <summary className="flex min-h-11 cursor-pointer items-center text-sm text-burgundy">How to do it</summary>
              <StepText text={s.item.body} className="pb-1 text-[15px]" />
            </details>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <div>
      {error ? (
        <p role="alert" className="mb-3 text-sm text-burgundy">
          {error}
        </p>
      ) : null}
      {steps.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ink/20 px-4 py-6 text-dim">
          No steps yet. When someone gives you a step on their timeline, it shows up here.
        </p>
      ) : next ? (
        <section aria-labelledby="next-up">
          <h2 id="next-up" className="mb-2 text-sm font-medium uppercase tracking-wide text-dim">
            Next up
          </h2>
          <ol>{card(next, true)}</ol>
        </section>
      ) : (
        <p className="rounded-xl border border-ink/10 px-4 py-6">All your steps are done.</p>
      )}

      {later.length ? (
        <section aria-labelledby="after-that" className="mt-6">
          <h2 id="after-that" className="mb-2 text-sm font-medium uppercase tracking-wide text-dim">
            After that
          </h2>
          <ol className="space-y-3">{later.map((s) => card(s, false))}</ol>
        </section>
      ) : null}

      {finished.length ? (
        <details className="mt-6">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm text-dim">Done ({finished.length})</summary>
          <ol className="mt-2 space-y-3">{finished.map((s) => card(s, false))}</ol>
        </details>
      ) : null}

      <section className="mt-10 border-t border-ink/10 pt-4">
        <h2 className="text-lg font-medium">Emails</h2>
        <Checkbox
          className="mt-1 text-base"
          label="Email me about my steps"
          checked={emails}
          disabled={pending}
          onChange={(e) => {
            const on = e.target.checked;
            setEmails(on);
            start(async () => {
              try {
                const res = await setEmailsAction({ on });
                if (!res.ok) throw new Error();
              } catch {
                setEmails(!on);
                setError("That didn't save. Try again.");
              }
            });
          }}
        />
        <p className="text-sm text-dim">
          One when someone gives you a step, and one at 8 AM when a step is overdue, due today or due in the next 3 days.
        </p>
      </section>
    </div>
  );
}
