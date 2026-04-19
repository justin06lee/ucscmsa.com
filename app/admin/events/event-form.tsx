"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

export function EventForm({ initial = {}, onSubmit, submitLabel }: Props) {
  const router = useRouter();
  const [freq, setFreq] = useState<Initial["recurrenceFreq"]>(
    initial.recurrenceFreq ?? "none"
  );
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      action={async (fd) => {
        setErr(null);
        const result = await onSubmit(fd);
        if (result.ok) router.push("/admin");
        else setErr(result.error ?? "Unknown error");
      }}
      className="grid gap-4 max-w-xl"
    >
      <label className="grid gap-1">
        <span className="text-sm text-dim">Title</span>
        <input name="title" defaultValue={initial.title ?? ""} required
          className="border border-ink/20 rounded px-3 py-2 bg-paper" />
      </label>
      <label className="grid gap-1">
        <span className="text-sm text-dim">Description</span>
        <textarea name="description" defaultValue={initial.description ?? ""} rows={4}
          className="border border-ink/20 rounded px-3 py-2 bg-paper" />
      </label>
      <label className="grid gap-1">
        <span className="text-sm text-dim">Location</span>
        <input name="location" defaultValue={initial.location ?? ""}
          className="border border-ink/20 rounded px-3 py-2 bg-paper" />
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="grid gap-1">
          <span className="text-sm text-dim">Start date</span>
          <input type="date" name="startDate" defaultValue={initial.startDate ?? ""} required
            className="border border-ink/20 rounded px-3 py-2 bg-paper" />
        </label>
        <label className="grid gap-1">
          <span className="text-sm text-dim">Start time</span>
          <input type="time" name="startTime" defaultValue={initial.startTime ?? ""} required
            className="border border-ink/20 rounded px-3 py-2 bg-paper" />
        </label>
        <label className="grid gap-1">
          <span className="text-sm text-dim">End date</span>
          <input type="date" name="endDate" defaultValue={initial.endDate ?? ""} required
            className="border border-ink/20 rounded px-3 py-2 bg-paper" />
        </label>
        <label className="grid gap-1">
          <span className="text-sm text-dim">End time</span>
          <input type="time" name="endTime" defaultValue={initial.endTime ?? ""} required
            className="border border-ink/20 rounded px-3 py-2 bg-paper" />
        </label>
      </div>
      <fieldset className="grid gap-2 border border-ink/20 rounded p-3">
        <legend className="text-sm text-dim px-1">Recurrence</legend>
        <label className="grid gap-1">
          <span className="text-sm text-dim">Repeats</span>
          <select name="recurrenceFreq" value={freq}
            onChange={(e) => setFreq(e.target.value as Initial["recurrenceFreq"])}
            className="border border-ink/20 rounded px-3 py-2 bg-paper">
            <option value="none">Does not repeat</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </label>
        {freq === "weekly" && (
          <div>
            <span className="text-sm text-dim">On days</span>
            <div className="flex gap-2 mt-1">
              {WEEKDAYS.map((d) => (
                <label key={d.v} className="flex items-center gap-1 text-sm">
                  <input type="checkbox" name="recurrenceByWeekday" value={d.v}
                    defaultChecked={initial.recurrenceByWeekday?.split(",").includes(d.v)} />
                  {d.l}
                </label>
              ))}
            </div>
          </div>
        )}
        {freq !== "none" && (
          <div className="grid grid-cols-2 gap-4">
            <label className="grid gap-1">
              <span className="text-sm text-dim">Every N</span>
              <input type="number" name="recurrenceInterval" min={1}
                defaultValue={initial.recurrenceInterval ?? 1}
                className="border border-ink/20 rounded px-3 py-2 bg-paper" />
            </label>
            <label className="grid gap-1">
              <span className="text-sm text-dim">Until (optional)</span>
              <input type="date" name="recurrenceUntil" defaultValue={initial.recurrenceUntil ?? ""}
                className="border border-ink/20 rounded px-3 py-2 bg-paper" />
            </label>
          </div>
        )}
      </fieldset>
      {err && <div className="text-burgundy text-sm">{err}</div>}
      <button type="submit"
        className="justify-self-start px-6 py-2 rounded-full bg-ink text-paper hover:bg-burgundy">
        {submitLabel}
      </button>
    </form>
  );
}
