"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TimePicker } from "@/components/ui/time-picker";

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
};

type Props = {
  initial?: Initial;
  onSubmit: (fd: FormData) => Promise<{ ok: boolean; error?: string }>;
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
          if (result.ok) router.push("/admin");
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
      <div className="grid grid-cols-2 gap-4">
        <Field label="Start date" hint={dateHint}>
          <DatePicker
            name="startDate"
            defaultValue={initial.startDate ?? ""}
            required={!isRecurring}
          />
        </Field>
        <Field label="Start time">
          <TimePicker name="startTime" defaultValue={initial.startTime ?? ""} required />
        </Field>
        <Field label="End date" hint={dateHint}>
          <DatePicker
            name="endDate"
            defaultValue={initial.endDate ?? ""}
            required={!isRecurring}
          />
        </Field>
        <Field label="End time">
          <TimePicker name="endTime" defaultValue={initial.endTime ?? ""} required />
        </Field>
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
            <div className="mt-1 flex flex-wrap gap-3">
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
          <div className="grid grid-cols-2 gap-4">
            <Field label="Every N">
              <Input
                type="number"
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
