"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { TimelineItem } from "@/lib/db/schema";
import { Progress, TimelineList, formatDay } from "@/components/playbook/timeline-items";
import {
  deleteTimelineAction,
  renameTimelineAction,
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
};

export function TimelineView({ id, title, eventDate, items, isPublic, shareUrl, today }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [dateOpen, setDateOpen] = useState(false);
  const [date, setDate] = useState(eventDate);
  const [name, setName] = useState(title);
  const [copied, setCopied] = useState(false);
  const shown = items.map((i) => (i.id in done ? { ...i, done: done[i.id] } : i));

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    start(async () => {
      try {
        const res = await fn();
        if (!res.ok) {
          setError(res.error ?? "That didn't save. Try again.");
          return;
        }
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
      <div className="mt-4">
        <Progress items={shown} />
        <TimelineList
          items={shown}
          today={today}
          check={(item) => (
            <Checkbox
              aria-label={`Done: ${item.title}`}
              className="min-w-11 justify-center"
              checked={item.done}
              onChange={(e) => toggle(item, e.target.checked)}
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
