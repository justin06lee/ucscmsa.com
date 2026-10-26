"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { formatYmd } from "@/components/board/format";
import { attempt } from "@/lib/attempt";
import {
  buildTimeline,
  type AgentSelection,
  type PlaybookCard,
} from "@/lib/playbook";
import {
  PLAN_TAGS,
  includeDependencies,
  templatesFor,
  type PlanTag,
} from "@/lib/planning";
import { isRealYmd } from "@/lib/event-rules";
import { createEventFromPlan, suggestEventPlan } from "./_agent-actions";

export function PlanComposer({
  cards,
  today,
}: {
  cards: PlaybookCard[];
  today: string;
}) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [proposal, setProposal] = useState<AgentSelection | null>(null);
  const [requestId, setRequestId] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const validDate = !!proposal?.eventYmd && isRealYmd(proposal.eventYmd);
  const selected = proposal ? includeDependencies(proposal.cardIds, cards) : [];
  const required = new Set(selected.flatMap((c) => c.dependencies));
  const timeline =
    proposal && validDate
      ? buildTimeline(proposal.eventYmd!, proposal.cardIds, cards, today)
      : [];
  const warningCount = timeline.filter((s) => s.warnings.length).length;
  function setTags(tag: PlanTag, checked: boolean) {
    if (!proposal) return;
    const tags = checked
      ? [...proposal.tags, tag]
      : proposal.tags.filter((t) => t !== tag);
    setProposal({
      ...proposal,
      tags,
      cardIds: templatesFor(tags, cards).map((c) => c.id),
    });
  }
  return (
    <section
      className="mb-10 max-w-3xl rounded-2xl border border-ink/15 bg-white/25 p-5 sm:p-6"
      aria-label="Plan from a description"
    >
      <form
        action={() => {
          setError("");
          setSaving(false);
          start(async () => {
            const r = await attempt(() => suggestEventPlan(description));
            if (!r.ok) setError(r.error);
            else if (r.value.ok) {
              setProposal(r.value.proposal);
              setRequestId(r.value.requestId);
            }
          });
        }}
      >
        <label htmlFor="event-description" className="block font-medium">
          What are you planning?
        </label>
        <p className="mt-1 text-sm text-dim">
          Tell us the date and what it needs. We’ll work back through your
          playbook.
        </p>
        <Textarea
          id="event-description"
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            if (proposal) setProposal(null);
          }}
          rows={3}
          placeholder="Iftar, March 12, ~80 people, serving food, need a room"
          maxLength={4000}
          minLength={5}
          required
          className="mt-4"
          disabled={pending}
        />
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          <Button
            type="submit"
            variant={proposal ? "outline" : "primary"}
            className="min-h-11"
            disabled={pending}
            aria-busy={pending && !saving}
          >
            {pending && !saving
              ? "Working on it…"
              : proposal
                ? "Try again"
                : "Make a timeline"}
          </Button>
          <Link
            href="/admin/events/new?draft=1"
            className="inline-flex min-h-11 items-center text-sm text-dim underline underline-offset-4"
          >
            Use the event form
          </Link>
        </div>
      </form>
      {proposal ? (
        <div className="mt-6 border-t border-ink/10 pt-6">
          <h2 className="text-2xl">Review your plan</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_13rem]">
            <label className="grid gap-1.5 text-sm text-dim">
              Event title
              <Input
                value={proposal.title}
                onChange={(e) =>
                  setProposal({ ...proposal, title: e.target.value })
                }
                maxLength={200}
                className="text-ink"
                disabled={pending}
              />
            </label>
            <div>
              <label
                className="mb-1.5 block text-sm text-dim"
                htmlFor="plan-date"
              >
                Event date
              </label>
              <DatePicker
                id="plan-date"
                name="event-date"
                value={proposal.eventYmd ?? ""}
                onChange={(day) =>
                  setProposal({ ...proposal, eventYmd: day || null })
                }
                required
                ariaLabel="Event date"
              />
            </div>
          </div>
          <fieldset className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
            <legend className="mb-1 text-sm text-dim">It needs</legend>
            {PLAN_TAGS.map((t) => (
              <Checkbox
                key={t.id}
                label={t.label}
                checked={proposal.tags.includes(t.id)}
                disabled={pending}
                onChange={(e) => setTags(t.id, e.target.checked)}
              />
            ))}
          </fieldset>
          <ul className="mt-3 grid gap-1 text-sm text-dim">
            {proposal.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          {proposal.eventYmd && proposal.eventYmd < today ? (
            <p className="mt-3 text-sm text-burgundy" role="status">
              The event date has passed. Choose a future date before saving.
            </p>
          ) : null}
          <details className="mt-3 border-t border-ink/10 pt-1">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm text-dim">
              Choose steps · {selected.length} included
            </summary>
            <p className="mb-2 text-sm text-dim">
              Required prerequisites stay selected while another step needs
              them.
            </p>
            <div className="grid gap-1">
              {cards.map((c) => (
                <Checkbox
                  key={c.id}
                  label={`${c.title}${required.has(c.id) ? " · prerequisite" : ""}`}
                  checked={selected.some((s) => s.id === c.id)}
                  disabled={pending || required.has(c.id)}
                  onChange={(e) => {
                    setProposal({
                      ...proposal,
                      cardIds: e.target.checked
                        ? [...proposal.cardIds, c.id]
                        : proposal.cardIds.filter((id) => id !== c.id),
                    });
                  }}
                />
              ))}
            </div>
          </details>
          {timeline.length ? (
            <div className="mt-4">
              <p className="text-sm text-dim">
                {timeline.length} steps
                {warningCount ? (
                  <span className="text-burgundy">
                    {" "}
                    · {warningCount} need attention
                  </span>
                ) : null}
              </p>
              <ol
                aria-label="Suggested timeline"
                className="mt-3 grid gap-3 border-l border-ink/15 pl-4"
              >
                {timeline.map((s) => (
                  <li
                    key={s.cardId}
                    className={`rounded-xl p-3 ${s.warnings.length ? "bg-burgundy/5" : "bg-white/25"}`}
                  >
                    <p className="text-xs font-medium text-dim">
                      {formatYmd(s.dueDate, "EEE, MMM d, yyyy")}
                    </p>
                    <Link
                      href={`/admin/playbook#step-${s.cardId}`}
                      className="inline-flex min-h-11 items-center text-sm font-medium underline decoration-ink/20 underline-offset-4"
                    >
                      {s.title}
                    </Link>
                    {s.dependencies.length ? (
                      <p className="text-xs text-dim">
                        After:{" "}
                        {s.dependencies
                          .map((id) => cards.find((c) => c.id === id)?.title)
                          .join("; ")}
                      </p>
                    ) : null}
                    {s.warnings.map((w) => (
                      <p
                        key={w}
                        className="mt-1 text-xs leading-relaxed text-burgundy"
                      >
                        {w}
                      </p>
                    ))}
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p className="my-4 text-sm text-dim">
              Choose a date and at least one step to see the timeline.
            </p>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button
              className="min-h-11"
              disabled={
                pending ||
                !validDate ||
                !proposal.title.trim() ||
                timeline.length === 0 ||
                proposal.eventYmd! < today
              }
              aria-busy={pending && saving}
              onClick={() => {
                setError("");
                setSaving(true);
                start(async () => {
                  const r = await attempt(() =>
                    createEventFromPlan({
                      title: proposal.title,
                      eventYmd: proposal.eventYmd,
                      description,
                      tags: proposal.tags,
                      cardIds: proposal.cardIds,
                      requestId,
                    }),
                  );
                  if (!r.ok) setError(r.error);
                  else if (r.value.ok)
                    router.push(`/admin/plan/${r.value.eventId}`);
                  setSaving(false);
                });
              }}
            >
              {pending && saving ? "Saving draft…" : "Save draft and checklist"}
            </Button>
            <p className="text-xs text-dim">
              Private to the board until you publish.
            </p>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-burgundy">
          {error}
        </p>
      ) : null}
    </section>
  );
}
