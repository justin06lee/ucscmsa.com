"use client";
import { useState, useTransition } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CardText } from "./card-text";
import { attempt } from "@/lib/attempt";
import { PLAN_TAGS, tagLabel } from "@/lib/planning";
import { leadLabel, type CardInput, type PlaybookCard } from "@/lib/playbook";
import {
  deletePlaybookCard,
  loadCardHistory,
  restorePlaybookCard,
  savePlaybookCard,
} from "./_card-actions";

type Version = Extract<
  Awaited<ReturnType<typeof loadCardHistory>>,
  { ok: true }
>["versions"][number];
const selectStyle =
  "min-h-11 max-w-full rounded-md border border-ink/20 bg-paper px-2 text-base";
export function CardEditor({
  card,
  cards,
  onClose,
}: {
  card?: PlaybookCard;
  cards: PlaybookCard[];
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [unit, setUnit] = useState(
    card?.daysBefore === 0
      ? "day-of"
      : card && card.daysBefore % 7 === 0
        ? "weeks"
        : "days",
  );
  const [confirming, setConfirming] = useState(false);
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [body, setBody] = useState(card?.body ?? "");
  function run(
    action: () => Promise<{ ok: boolean; error?: string }>,
    close = true,
  ) {
    setError("");
    start(async () => {
      const r = await attempt(action);
      if (!r.ok) setError(r.error);
      else if (close) onClose();
    });
  }
  return (
    <form
      className="grid gap-4"
      aria-label={card ? `Edit ${card.title}` : "New step"}
      action={(fd) => {
        const input: CardInput = {
          title: String(fd.get("title") ?? ""),
          body,
          daysBefore:
            unit === "day-of"
              ? 0
              : Number(fd.get("lead")) * (unit === "weeks" ? 7 : 1),
          tag: (String(fd.get("tag") || "") || null) as CardInput["tag"],
          dependencies: fd.getAll("dependency").map(String),
        };
        run(() =>
          savePlaybookCard(card?.id ?? null, input, card?.revision ?? null),
        );
      }}
    >
      <label className="grid gap-1.5 text-sm text-dim">
        Step title
        <Input
          name="title"
          defaultValue={card?.title ?? ""}
          required
          maxLength={200}
          autoFocus
          className="text-base text-ink"
        />
      </label>
      <label className="grid gap-1.5 text-sm text-dim">
        What to do
        <Textarea
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={7}
          maxLength={20000}
          className="text-base text-ink"
        />
      </label>
      {body ? (
        <div>
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="min-h-11 text-sm text-dim underline"
          >
            {showPreview ? "Hide preview" : "Preview text"}
          </button>
          {showPreview ? <CardText source={body} /> : null}
        </div>
      ) : null}
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="mb-2 text-sm text-dim">When</legend>
        {unit !== "day-of" ? (
          <Input
            key={unit}
            name="lead"
            type="number"
            inputMode="numeric"
            min={1}
            max={unit === "weeks" ? 17 : 120}
            required
            defaultValue={Math.max(
              1,
              Math.round((card?.daysBefore ?? 7) / (unit === "weeks" ? 7 : 1)),
            )}
            aria-label="Lead time"
            className="w-20"
          />
        ) : null}
        <select
          aria-label="Lead time unit"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          className={selectStyle}
        >
          <option value="days">days before</option>
          <option value="weeks">weeks before</option>
          <option value="day-of">day of</option>
        </select>
      </fieldset>
      <label className="grid gap-1.5 text-sm text-dim">
        Applies to
        <select
          name="tag"
          defaultValue={card?.tag ?? ""}
          className={`${selectStyle} text-ink`}
        >
          <option value="">Every event</option>
          {PLAN_TAGS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <details className="border-t border-ink/10 pt-1">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm text-dim">
          Depends on
          {card?.dependencies.length
            ? ` · ${card.dependencies.length} steps`
            : ""}
        </summary>
        <p className="mb-2 text-sm text-dim">
          These steps must happen first. They are included in the timeline
          automatically.
        </p>
        <div className="max-h-64 overflow-y-auto">
          {cards
            .filter((c) => c.id !== card?.id)
            .map((c) => (
              <Checkbox
                key={c.id}
                name="dependency"
                value={c.id}
                defaultChecked={card?.dependencies.includes(c.id)}
                label={c.title}
                className="flex w-full"
              />
            ))}
        </div>
      </details>
      <p className="text-xs text-dim">
        Changes update open tasks. Completed tasks keep their history.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-burgundy">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="min-h-11"
        >
          {pending ? "Saving…" : "Save step"}
        </Button>
        <Button
          variant="ghost"
          className="min-h-11"
          onClick={onClose}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
      {card ? (
        <div className="border-t border-ink/10 pt-1">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={pending}
              className="min-h-11 text-sm text-dim underline"
              onClick={() => {
                setHistoryOpen(!historyOpen);
                if (!versions) {
                  setError("");
                  start(async () => {
                    const r = await attempt(() => loadCardHistory(card.id));
                    if (r.ok && r.value.ok) setVersions(r.value.versions);
                    else if (!r.ok) setError(r.error);
                  });
                }
              }}
            >
              Version history
            </button>
            {!confirming ? (
              <button
                type="button"
                className="min-h-11 text-sm text-burgundy"
                disabled={pending}
                onClick={() => setConfirming(true)}
              >
                Delete step
              </button>
            ) : null}
          </div>
          {confirming ? (
            <div className="mt-2 rounded-lg bg-burgundy/5 p-3">
              <p className="text-sm">
                Delete this step? Its history and completed tasks will be kept.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  variant="danger"
                  className="min-h-11"
                  disabled={pending}
                  onClick={() =>
                    run(() => deletePlaybookCard(card.id, card.revision))
                  }
                >
                  Delete step
                </Button>
                <Button
                  variant="ghost"
                  className="min-h-11"
                  disabled={pending}
                  onClick={() => setConfirming(false)}
                >
                  Keep step
                </Button>
              </div>
            </div>
          ) : null}
          {historyOpen ? (
            <div className="mt-3 grid gap-3">
              {versions === null ? (
                <p className="text-sm text-dim">Loading history…</p>
              ) : (
                versions.map((v, index) => (
                  <details
                    key={v.id}
                    className="rounded-lg border border-ink/10 p-3"
                  >
                    <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-1 text-sm">
                      {index === 0 ? "Current · " : ""}
                      {new Date(v.when).toLocaleDateString("en-US", {
                        timeZone: "America/Los_Angeles",
                      })}{" "}
                      · {v.by}
                    </summary>
                    <p className="mt-2 font-medium">{v.snapshot.title}</p>
                    <p className="my-2 text-sm text-dim">
                      {leadLabel(v.snapshot.daysBefore)} ·{" "}
                      {tagLabel(v.snapshot.tag)}
                    </p>
                    <CardText source={v.snapshot.body} />
                    {v.snapshot.dependencies.length ? (
                      <p className="my-3 text-sm text-dim">
                        Depends on:{" "}
                        {v.snapshot.dependencies
                          .map(
                            (id) =>
                              cards.find((c) => c.id === id)?.title ??
                              "Deleted step",
                          )
                          .join("; ")}
                      </p>
                    ) : null}
                    <Button
                      variant="outline"
                      className="mt-3 min-h-11"
                      disabled={pending}
                      onClick={() =>
                        run(() =>
                          restorePlaybookCard(card.id, v.id, card.revision),
                        )
                      }
                    >
                      Restore this version
                    </Button>
                  </details>
                ))
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
