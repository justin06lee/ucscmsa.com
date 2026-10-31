"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { PLAN_TAGS } from "@/lib/planning";

/**
 * The event form's planning fields: Draft, and what the event needs. Each tag
 * adds its tasks to the event's checklist (app/admin/plan). Tags only apply to
 * one-off events, so they are hidden while the event repeats.
 */
export function PlanningFields({
  draft,
  tags = [],
  recurring,
}: {
  draft?: boolean;
  tags?: string[];
  recurring: boolean;
}) {
  return (
    <fieldset className="grid gap-2 paper-card p-4">
      <legend className="px-1 text-sm text-dim">Planning</legend>
      {/* Tells the server this form carries draft and tags. */}
      <input type="hidden" name="planning" value="1" />
      <Checkbox name="draft" defaultChecked={draft} label="Draft: only admins can see it" className="-ml-1.5 text-base!" />
      {recurring ? null : (
        <div className="grid gap-2">
          <span id="plan-tags-label" className="text-sm text-dim">
            It needs
          </span>
          <div role="group" aria-labelledby="plan-tags-label" className="flex flex-wrap gap-2">
            {PLAN_TAGS.map((t) => (
              <label
                key={t.id}
                className="btn btn-outline cursor-pointer select-none px-4 font-normal has-[:checked]:text-paper has-[:checked]:before:bg-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-burgundy"
              >
                <input type="checkbox" name="tags" value={t.id} defaultChecked={tags.includes(t.id)} className="sr-only" />
                {t.label}
              </label>
            ))}
          </div>
          <p className="text-sm text-dim">Each one adds its tasks to the event&apos;s checklist, with due dates.</p>
        </div>
      )}
    </fieldset>
  );
}
