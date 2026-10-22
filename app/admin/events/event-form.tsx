"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TimePicker } from "@/components/ui/time-picker";
import {
  LINK_KIND_LABELS,
  LINK_KINDS,
  LINK_LABEL_MAX,
  LINK_URL_MAX,
  LINKS_MAX,
  type EventLink,
  type LinkKind,
} from "@/lib/event-rules";
import { PlanningFields } from "@/components/board/planning-fields";

type Initial = {
  id?: string;
  title?: string;
  description?: string;
  location?: string;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  recurrenceFreq?: "none" | "daily" | "weekly" | "monthly" | "yearly";
  recurrenceByWeekday?: string;
  recurrenceInterval?: number;
  recurrenceUntil?: string;
  links?: EventLink[];
  draft?: boolean;
  tags?: string[];
};

type Props = {
  initial?: Initial;
  onSubmit: (fd: FormData) => Promise<{ ok: boolean; error?: string; id?: string; planned?: boolean }>;
  submitLabel: string;
};

const WEEKDAYS = [
  { v: "SU", l: "Sun" },
  { v: "MO", l: "Mon" },
  { v: "TU", l: "Tue" },
  { v: "WE", l: "Wed" },
  { v: "TH", l: "Thu" },
  { v: "FR", l: "Fri" },
  { v: "SA", l: "Sat" },
];

const FREQ_OPTIONS = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

// What each link kind is called in the form's menu.
const LINK_KIND_NAMES: Record<LinkKind, string> = {
  rsvp: "RSVP",
  form: "Form",
  donate: "Donation",
  signup: "Sign-up",
  map: "Map",
  other: "Other",
};
const LINK_KIND_OPTIONS = LINK_KINDS.map((k) => ({ value: k, label: LINK_KIND_NAMES[k] }));

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1">
      <span className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-dim">{label}</span>
        {hint ? <span className="text-xs text-dim/70">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

type LinkRow = { key: number; kind: LinkKind; label: string; url: string };

// Buttons on the event page, sent as rows of linkKind/linkLabel/linkUrl
// fields (app/admin/_actions.ts). A label left as its kind's default shows
// blank, so changing the kind changes the label with it.
function LinksField({ initial }: { initial: EventLink[] }) {
  const [rows, setRows] = useState<LinkRow[]>(() =>
    initial.map((l, i) => ({
      key: i,
      kind: l.kind,
      label: l.label === LINK_KIND_LABELS[l.kind] ? "" : l.label,
      url: l.url,
    })),
  );
  const nextKey = useRef(initial.length);

  return (
    <fieldset className="grid gap-3 rounded-md border border-ink/20 p-4">
      <legend className="px-1 text-sm text-dim">Links</legend>
      <p className="text-xs text-dim/80">
        Buttons on the event page. The first RSVP link, or else the first
        form, is the main button; the rest show beside it.
      </p>
      {rows.length > 0 && (
        <ol className="grid gap-4">
          {rows.map((r, i) => (
            <li key={r.key} className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-2">
              <Select
                name="linkKind"
                value={r.kind}
                onChange={(v) =>
                  setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, kind: v as LinkKind } : x)))
                }
                options={LINK_KIND_OPTIONS}
                ariaLabel={`Link ${i + 1} kind`}
              />
              <Input
                name="linkLabel"
                defaultValue={r.label}
                placeholder={LINK_KIND_LABELS[r.kind]}
                maxLength={LINK_LABEL_MAX}
                aria-label={`Link ${i + 1} label`}
              />
              <div className="col-span-2 flex gap-2">
                <Input
                  name="linkUrl"
                  type="url"
                  inputMode="url"
                  defaultValue={r.url}
                  placeholder="https://"
                  maxLength={LINK_URL_MAX}
                  aria-label={`Link ${i + 1} URL`}
                />
                <Button
                  variant="ghost"
                  className="size-11 shrink-0 !p-0"
                  aria-label={`Remove link ${i + 1}`}
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
      {rows.length === 0 && (
        // No linkUrl field at all would leave the saved links alone.
        <input type="hidden" name="linkUrl" value="" />
      )}
      {rows.length < LINKS_MAX && (
        <Button
          variant="outline"
          className="min-h-11 justify-self-start"
          onClick={() =>
            setRows((rs) => [...rs, { key: nextKey.current++, kind: rs.length ? "other" : "rsvp", label: "", url: "" }])
          }
        >
          Add a link
        </Button>
      )}
    </fieldset>
  );
}

export function EventForm({ initial = {}, onSubmit, submitLabel }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [freq, setFreq] = useState<NonNullable<Initial["recurrenceFreq"]>>(
    initial.recurrenceFreq ?? "none",
  );
  const [err, setErr] = useState<string | null>(null);
  const isRecurring = freq !== "none";
  const dateHint = isRecurring ? "Optional — defaults to today" : undefined;

  return (
    <form
      action={(fd) => {
        setErr(null);
        start(async () => {
          const result = await onSubmit(fd);
          // A planned event opens on its checklist.
          if (result.ok) router.push(result.planned && result.id ? `/admin/plan/${result.id}` : "/admin");
          else setErr(result.error ?? "Unknown error");
        });
      }}
      className="grid max-w-xl gap-4"
    >
      <Field label="Title">
        <Input name="title" defaultValue={initial.title ?? ""} required />
      </Field>
      <Field label="Description">
        <Textarea name="description" defaultValue={initial.description ?? ""} rows={4} />
      </Field>
      <Field label="Location">
        <Input name="location" defaultValue={initial.location ?? ""} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Start date" hint={dateHint}>
          <DatePicker
            name="startDate"
            defaultValue={initial.startDate ?? ""}
            required={!isRecurring}
          />
        </Field>
        <Field label="Start time" hint="Optional">
          <TimePicker name="startTime" defaultValue={initial.startTime ?? ""} ariaLabel="Start time" />
        </Field>
        <Field label="End date" hint={dateHint}>
          <DatePicker
            name="endDate"
            defaultValue={initial.endDate ?? ""}
            required={!isRecurring}
          />
        </Field>
        <Field label="End time" hint="Optional">
          <TimePicker name="endTime" defaultValue={initial.endTime ?? ""} ariaLabel="End time" />
        </Field>
        <p className="text-xs text-dim sm:col-span-2">
          Leave both times blank if they haven&rsquo;t been announced, or the
          end time blank if only the start is known. The site then says
          &ldquo;Time not announced&rdquo; instead of guessing.
        </p>
      </div>
      <div className="grid gap-3 rounded-md border border-ink/20 p-4">
        <span className="text-sm text-dim">Recurrence</span>
        <p className="text-xs text-dim/80">
          Recurring events keep the same wall-clock UTC time, so an event may
          appear an hour earlier or later in local time across DST transitions
          (March and November).
        </p>
        <Field label="Repeats">
          <Select
            name="recurrenceFreq"
            value={freq}
            onChange={(v) => setFreq(v as NonNullable<Initial["recurrenceFreq"]>)}
            options={FREQ_OPTIONS}
          />
        </Field>
        {freq === "weekly" && (
          <div className="grid gap-1">
            <span className="text-sm text-dim">On days</span>
            <div className="mt-1 flex flex-wrap gap-x-1 gap-y-0">
              {WEEKDAYS.map((d) => (
                <Checkbox
                  key={d.v}
                  name="recurrenceByWeekday"
                  value={d.v}
                  defaultChecked={initial.recurrenceByWeekday?.split(",").includes(d.v)}
                  label={d.l}
                />
              ))}
            </div>
          </div>
        )}
        {freq !== "none" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Every N">
              <Input
                type="number"
                inputMode="numeric"
                name="recurrenceInterval"
                min={1}
                defaultValue={initial.recurrenceInterval ?? 1}
              />
            </Field>
            <Field label="Until" hint="Optional">
              <DatePicker
                name="recurrenceUntil"
                defaultValue={initial.recurrenceUntil ?? ""}
              />
            </Field>
          </div>
        )}
      </div>
      <LinksField initial={initial.links ?? []} />
      <PlanningFields draft={initial.draft} tags={initial.tags} recurring={isRecurring} />
      {err && (
        <div role="alert" className="text-sm text-burgundy">
          {err}
        </div>
      )}
      <Button type="submit" size="lg" disabled={pending} className="justify-self-start">
        {submitLabel}
      </Button>
    </form>
  );
}
