"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { TimelineItem } from "@/lib/db/schema";
import { Progress, TimelineList, formatDay } from "@/components/playbook/timeline-items";
import type { BoardMember } from "../_plan";
import {
  assignStepAction,
  deleteTimelineAction,
  renameTimelineAction,
  setCalendarAction,
  setDateAction,
  setPublicAction,
  toggleItemAction,
} from "../_actions";

type Props = {
  id: string;
  title: string;
  eventDate: string;
  items: TimelineItem[];
  isPublic: boolean;
  shareUrl: string;
  today: string;
  /** Item id to the user id of the board member doing it. */
  owners: Record<string, string>;
  members: BoardMember[];
  /** Null while the MSA calendar isn't connected. */
  calendar: { onCalendar: boolean; behind: boolean } | null;
};

export function TimelineView({ id, title, eventDate, items, isPublic, shareUrl, today, owners, members, calendar }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [dateOpen, setDateOpen] = useState(false);
  const [date, setDate] = useState(eventDate);
  const [name, setName] = useState(title);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [assigned, setAssigned] = useState<Record<string, string | null>>({});
  const shown = items.map((i) => (i.id in done ? { ...i, done: done[i.id] } : i));
  const ownerOf = (itemId: string) => (itemId in assigned ? assigned[itemId] : owners[itemId] ?? null);

  function run(fn: () => Promise<{ ok: boolean; error?: string; notice?: string }>, after?: () => void) {
    setError(null);
    setNotice(null);
    start(async () => {
      try {
        const res = await fn();
        if (!res.ok) {
          setError(res.error ?? "That didn't save. Try again.");
          return;
        }
        if (res.notice) setNotice(res.notice);
        after?.();
        router.refresh();
      } catch {
        setError("That didn't save. Try again.");
      }
    });
  }

  function toggle(item: TimelineItem, next: boolean) {
    setDone((d) => ({ ...d, [item.id]: next }));
    start(async () => {
      try {
        const res = await toggleItemAction({ id, itemId: item.id, done: next });
        if (!res.ok) throw new Error();
      } catch {
        setDone((d) => ({ ...d, [item.id]: !next }));
        setError("That didn't save. Try again.");
      }
    });
  }

  function assign(item: TimelineItem, userId: string | null) {
    const before = ownerOf(item.id);
    setAssigned((a) => ({ ...a, [item.id]: userId }));
    setError(null);
    start(async () => {
      try {
        const res = await assignStepAction({ id, itemId: item.id, userId });
        if (!res.ok) throw new Error(res.error);
      } catch (err) {
        setAssigned((a) => ({ ...a, [item.id]: before }));
        setError(err instanceof Error && err.message ? err.message : "That didn't save. Try again.");
      }
    });
  }

  return (
    <div>
      <h1 className="text-3xl leading-tight">{title}</h1>
      {dateOpen ? (
        <form
          className="mt-2 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => setDateAction({ id, eventDate: date }), () => setDateOpen(false));
          }}
        >
          <label className="block w-full text-sm text-dim" htmlFor="event-date">
            Event date
          </label>
          <Input
            id="event-date"
            type="date"
            className="max-w-48 text-base"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Button type="submit" size="sm" className="min-h-11" disabled={pending || !date || date === eventDate}>
            Save date
          </Button>
          <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => setDateOpen(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-dim">
          <span>Event on {formatDay(eventDate)}</span>
          <button
            type="button"
            className="inline-flex min-h-11 items-center px-1 text-sm text-burgundy underline decoration-burgundy/30 underline-offset-4"
            onClick={() => setDateOpen(true)}
          >
            Change date
          </button>
        </p>
      )}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-burgundy">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mt-2 text-sm text-dim">
          {notice}
        </p>
      ) : null}
      <div className="mt-4">
        <Progress items={shown} />
        <TimelineList
          items={shown}
          eventDate={eventDate}
          today={today}
          check={(item) => (
            <Checkbox
              aria-label={`Done: ${item.title}`}
              className="min-w-11 justify-center"
              checked={item.done}
              onChange={(e) => toggle(item, e.target.checked)}
            />
          )}
          owner={(item) => (
            <StepOwner
              stepTitle={item.title}
              value={ownerOf(item.id)}
              members={members}
              onChange={(userId) => assign(item, userId)}
            />
          )}
        />
      </div>

      <section className="mt-8 border-t border-ink/10 pt-4">
        <h2 className="text-lg font-medium">Share</h2>
        <Checkbox
          className="mt-1 text-base"
          label="Anyone with the link can see this timeline"
          checked={isPublic}
          disabled={pending}
          onChange={(e) => run(() => setPublicAction({ id, isPublic: e.target.checked }))}
        />
        {isPublic ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Input readOnly aria-label="Share link" className="min-w-0 flex-1 text-base" value={shareUrl} onFocus={(e) => e.target.select()} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shareUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  setError("Copy didn't work. Select the link and copy it.");
                }
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-dim">Only you can see it now.</p>
        )}
      </section>

      {calendar ? (
        <section className="mt-8 border-t border-ink/10 pt-4">
          <h2 className="text-lg font-medium">MSA calendar</h2>
          <Checkbox
            className="mt-1 text-base"
            label="Put it on the MSA Google Calendar"
            checked={calendar.onCalendar}
            disabled={pending}
            onChange={(e) => run(() => setCalendarAction({ id, onCalendar: e.target.checked }))}
          />
          <p className="text-sm text-dim">
            {calendar.onCalendar
              ? calendar.behind
                ? "On it, but the last change hasn't reached it yet. It will try again tomorrow morning."
                : "On it as an all-day event. A new name or date updates it."
              : "Members who added the MSA calendar see its name and date."}
          </p>
        </section>
      ) : null}

      <details className="mt-8 border-t border-ink/10 pt-3">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm text-dim">Rename or delete</summary>
        <form
          className="mt-2 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => renameTimelineAction({ id, title: name }));
          }}
        >
          <label className="sr-only" htmlFor="timeline-name">
            Name
          </label>
          <Input id="timeline-name" className="min-w-0 flex-1 text-base" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" size="sm" variant="outline" className="min-h-11" disabled={pending || !name.trim() || name === title}>
            Rename
          </Button>
        </form>
        <Button
          type="button"
          variant="danger-outline"
          size="sm"
          className="mt-4 min-h-11"
          disabled={pending}
          onClick={() => {
            if (!window.confirm("Delete this timeline? This can't be undone.")) return;
            run(() => deleteTimelineAction({ id }), () => router.push("/admin/plan"));
          }}
        >
          Delete timeline
        </Button>
      </details>
    </div>
  );
}

/** Who does a step: a board member, or no one yet. One native picker, so phones use their own. */
function StepOwner({
  stepTitle,
  value,
  members,
  onChange,
}: {
  stepTitle: string;
  value: string | null;
  members: BoardMember[];
  onChange: (userId: string | null) => void;
}) {
  const known = !value || members.some((m) => m.userId === value);
  return (
    <select
      aria-label={`Who does: ${stepTitle}`}
      data-testid="step-owner"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={`min-h-11 max-w-full appearance-none rounded-full border px-4 text-base ${
        value ? "border-ink/25 text-ink" : "border-dashed border-ink/20 text-dim"
      } bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40`}
    >
      <option value="">{value ? "No one" : "Assign"}</option>
      {members.map((m) => (
        <option key={m.userId} value={m.userId}>
          {m.name}
        </option>
      ))}
      {known ? null : <option value={value!}>Former board member</option>}
    </select>
  );
}
