"use client";

import { useState, useTransition } from "react";
import { attempt } from "@/lib/attempt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LEAD_DAYS_MAX, type TaskTemplate } from "@/lib/planning";
import { saveLeadTimes } from "../_actions";

type Group = { tag: string | null; label: string; templates: TaskTemplate[] };

export function LeadTimesForm({ groups }: { groups: Group[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <form
      action={(fd) => {
        setMsg(null);
        start(async () => {
          const r = await attempt(() => saveLeadTimes(fd));
          start(() => setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error }));
        });
      }}
      className="mt-8 grid gap-8"
    >
      {groups.map((g) => (
        <fieldset key={g.tag ?? "all"} className="grid gap-3">
          <legend className="mb-1 text-sm font-medium text-dim">{g.label}</legend>
          {g.templates.map((t) => (
            <div key={t.id} className="grid grid-cols-[1fr_auto] items-center gap-3">
              <input type="hidden" name="id" value={t.id} />
              <Input name={`title:${t.id}`} defaultValue={t.title} aria-label="Task" required maxLength={200} />
              <label className="flex items-center gap-2 text-sm text-dim">
                <Input
                  name={`days:${t.id}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={LEAD_DAYS_MAX}
                  defaultValue={t.daysBefore}
                  required
                  className="w-20 text-right tabular-nums"
                  aria-label={`Days before the event: ${t.title}`}
                />
                <span aria-hidden>days</span>
              </label>
            </div>
          ))}
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={pending} aria-busy={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {msg ? (
          <span role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-dim" : "text-burgundy"}`}>
            {msg.text}
          </span>
        ) : null}
      </div>
    </form>
  );
}
