"use client";

import { startTransition, useMemo, useOptimistic, useState } from "react";
import { deleteEvent, setEventCancelled } from "@/app/admin/_actions";
import type { AdminEventRow } from "@/app/admin/_event-rows";
import { FILTERS, type Filter, type Tab } from "@/app/admin/_event-filters";
import { IntentLink } from "@/components/intent-link";
import { RowMenu } from "@/app/admin/row-menu";
import { LinkPending } from "@/components/link-pending";
import { EventCover } from "@/components/event-cover";
import { DraftBadge } from "@/components/board/draft-badge";
import { attempt } from "@/lib/attempt";



const matches: Record<Filter, (r: AdminEventRow) => boolean> = {
  all: () => true,
  drafts: (r) => r.draft,
  cancelled: (r) => r.cancelled,
  "no-flyer": (r) => !r.thumb,
  imported: (r) => r.imported != null,
  manual: (r) => r.imported == null,
};

// Case and accents don't matter: "eid" finds "Eid", "cafe" finds "Café".
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

type Change = { id: string; remove: true } | { id: string; cancelled: boolean };

/**
 * The admin Events page: Upcoming and Past, grouped by day like the public
 * timeline, with search and filters applied as you type (no round trip) and
 * the state kept in the URL. Quick actions show their outcome at once and
 * roll back, with a quiet line under the row, if the server says no.
 */
export function EventsList({
  rows,
  todayYmd,
  initial,
}: {
  rows: AdminEventRow[];
  todayYmd: string;
  initial: { tab: Tab; filter: Filter; q: string };
}) {
  const [tab, setTab] = useState<Tab>(initial.tab);
  const [filter, setFilter] = useState<Filter>(initial.filter);
  const [q, setQ] = useState(initial.q);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [list, change] = useOptimistic(rows, (current: AdminEventRow[], c: Change) =>
    "remove" in c ? current.filter((r) => r.id !== c.id) : current.map((r) => (r.id === c.id ? { ...r, cancelled: c.cancelled } : r)),
  );

  function remember(next: { tab?: Tab; filter?: Filter; q?: string }) {
    const s = { tab, filter, q, ...next };
    const params = new URLSearchParams();
    if (s.tab !== "upcoming") params.set("tab", s.tab);
    if (s.filter !== "all") params.set("show", s.filter);
    if (s.q.trim()) params.set("q", s.q.trim());
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }

  function run(c: Change, action: () => Promise<unknown>) {
    setErrors((e) => {
      const rest = { ...e };
      delete rest[c.id];
      return rest;
    });
    startTransition(async () => {
      change(c);
      const result = await attempt(action);
      if (!result.ok) startTransition(() => setErrors((e) => ({ ...e, [c.id]: result.error })));
    });
  }

  const shown = useMemo(() => {
    const needle = fold(q.trim());
    return list.filter(
      (r) => matches[filter](r) && (!needle || fold(r.title).includes(needle) || fold(r.location).includes(needle)),
    );
  }, [list, filter, q]);
  const counts = { upcoming: shown.filter((r) => r.upcoming).length, past: shown.filter((r) => !r.upcoming).length };
  const days = useMemo(() => {
    const byDay = new Map<string, AdminEventRow[]>();
    for (const r of shown) if (r.upcoming === (tab === "upcoming")) byDay.set(r.ymd, [...(byDay.get(r.ymd) ?? []), r]);
    return [...byDay.entries()];
  }, [shown, tab]);

  return (
    <div>
      <div className="flex flex-col gap-3">
        <label className="relative block">
          <span className="sr-only">Search events</span>
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              remember({ q: e.target.value });
            }}
            placeholder="Search by title or place"
            className="min-h-11 w-full rounded-[2px] border border-ink/20 bg-scrap px-4 text-base outline-none transition-colors focus:border-ink/50"
          />
        </label>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div role="tablist" aria-label="When" className="inline-flex">
            {(["upcoming", "past"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                type="button"
                aria-selected={tab === t}
                onClick={() => {
                  setTab(t);
                  remember({ tab: t });
                }}
                className={`btn px-4 text-sm ${tab === t ? "btn-primary" : "btn-ghost"}`}
              >
                {t === "upcoming" ? "Upcoming" : "Past"} <span className="tabular-nums opacity-70">{counts[t]}</span>
              </button>
            ))}
          </div>
          <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
            {(Object.keys(FILTERS) as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => {
                  setFilter(f);
                  remember({ filter: f });
                }}
                className={`btn px-3.5 text-sm ${filter === f ? "btn-primary" : "btn-ghost"}`}
              >
                {FILTERS[f]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {days.length === 0 ? (
        <p className="py-12 text-center text-dim">
          {rows.length === 0 ? "No events yet. Create one to get started." : `No ${tab} events match.`}
        </p>
      ) : (
        <ol className="timeline mt-6" aria-label={tab === "upcoming" ? "Upcoming events" : "Past events"}>
          {days.map(([ymd, dayRows]) => (
            <li key={ymd} className="timeline__day" data-day={ymd} data-today={ymd === todayYmd ? "" : undefined}>
              <h2 className="flex min-h-11 items-center text-sm font-medium">{dayRows[0].dayLabel}</h2>
              <ul className="flex flex-col gap-2.5">
                {dayRows.map((r) => (
                  <EventRow
                    key={r.id}
                    row={r}
                    error={errors[r.id]}
                    onCancel={(cancelled) => run({ id: r.id, cancelled }, () => setEventCancelled(r.id, cancelled))}
                    onDelete={() => run({ id: r.id, remove: true }, () => deleteEvent(r.id))}
                  />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function EventRow({
  row: r,
  error,
  onCancel,
  onDelete,
}: {
  row: AdminEventRow;
  error?: string;
  onCancel: (cancelled: boolean) => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const action = "btn px-3 text-sm";
  return (
    <li className="admin-event paper-card p-3" data-event-id={r.id}>
      <div className="flex gap-3">
        <EventCover image={r.thumb} title={r.title} date={new Date(r.at)} compact className="w-12 self-start" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-medium leading-snug [overflow-wrap:anywhere]">{r.title}</span>
          <span className="text-sm text-ink/70 [overflow-wrap:anywhere]">
            <span className="tabular-nums">{r.time}</span>
            {r.location ? ` · ${r.location}` : ""}
          </span>
          {r.draft || r.cancelled || r.pattern || r.imported ? (
            <span className="flex flex-wrap gap-1.5">
              {r.draft ? <DraftBadge /> : null}
              {r.cancelled ? (
                <span className="rounded-full bg-burgundy px-2 py-0.5 text-xs font-medium text-paper">Cancelled</span>
              ) : null}
              {r.pattern ? (
                <span className="rounded-full bg-ink/[0.06] px-2 py-0.5 text-xs text-ink/75">Repeats · {r.pattern}</span>
              ) : null}
              {r.imported ? (
                <span className="rounded-[2px] bg-ink/[0.06] px-2 py-0.5 text-xs text-ink/75">{r.imported}</span>
              ) : null}
            </span>
          ) : null}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1 sm:pl-[3.75rem]">
        <IntentLink href={`/admin/events/${r.id}/edit`} aria-label={`Edit ${r.title}`} className={`${action} btn-primary`}>
          Edit
          <LinkPending />
        </IntentLink>
        {r.draft ? null : (
          <IntentLink href={`/calendar/events/${r.id}`} aria-label={`View ${r.title} on the site`} className={`${action} btn-ghost`}>
            View
            <LinkPending />
          </IntentLink>
        )}
        {confirming ? (
          <span className="inline-flex flex-wrap items-center gap-1" role="group" aria-label={`Delete ${r.title}?`}>
            <span className="px-1 text-sm text-burgundy">Delete for good?</span>
            <button type="button" onClick={onDelete} className={`${action} btn-danger`}>
              Delete
            </button>
            <button type="button" onClick={() => setConfirming(false)} className={`${action} btn-ghost`}>
              Keep
            </button>
          </span>
        ) : (
          <RowMenu
            label={`More actions for ${r.title}`}
            items={[
              { label: r.cancelled ? "Uncancel event" : "Cancel event", onSelect: () => onCancel(!r.cancelled) },
              { label: "Delete…", danger: true, onSelect: () => setConfirming(true) },
            ]}
          />
        )}
      </div>
      {error ? (
        <p role="status" className="mt-1 text-sm text-burgundy sm:pl-[3.75rem]">
          {error}
        </p>
      ) : null}
    </li>
  );
}
