"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { BookOpen, Check, ChevronDown } from "lucide-react";
import { assignTask, toggleTask } from "../_actions";
import { formatYmd, relativeDay } from "@/components/board/format";
import type { BoardMember, TimelineTask } from "../_plan";

function dueText(task: TimelineTask, done: boolean, today: string): string {
  const day = formatYmd(task.dueDate, "EEE, MMM d");
  if (done) return task.doneByName ? `Done by ${task.doneByName}` : "Done";
  if (task.dueDate < today) return `Overdue · was due ${day}`;
  if (task.dueDate === today) return "Due today";
  return `Due ${day} · ${relativeDay(task.dueDate, today)}`;
}

export function TaskItem({
  task,
  members,
  today,
}: {
  task: TimelineTask;
  members: BoardMember[];
  today: string;
}) {
  const [pending, start] = useTransition();
  const [done, setDone] = useOptimistic(task.state === "done");
  const [assignee, setAssignee] = useOptimistic(task.assigneeUserId ?? "");
  const [err, setErr] = useState<string | null>(null);
  const overdue = !done && task.dueDate < today;
  const dueToday = !done && task.dueDate === today;
  const assigneeName = members.find((m) => m.userId === assignee)?.name;
  const inputId = `task-${task.id}`;

  return (
    <div
      data-state={done ? "done" : overdue ? "overdue" : dueToday ? "today" : "open"}
      className={`rounded-xl px-3 py-1.5 ${overdue ? "bg-burgundy/[0.07]" : ""}`}
    >
      <label htmlFor={inputId} className="flex min-h-11 cursor-pointer items-start gap-3 py-2.5">
        <span
          aria-hidden
          className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
            done ? "border-ink bg-ink" : overdue ? "border-burgundy/60 bg-paper" : "border-ink/35 bg-paper"
          }`}
        >
          {done ? <Check size={13} strokeWidth={3} className="text-paper" /> : null}
        </span>
        <input
          id={inputId}
          type="checkbox"
          className="peer sr-only"
          checked={done}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.checked;
            setErr(null);
            start(async () => {
              setDone(next);
              const r = await toggleTask(task.id, next);
              if (!r.ok) setErr("Couldn't save that. Try again.");
            });
          }}
        />
        <span className={`min-w-0 break-words ${done ? "text-dim line-through decoration-ink/30" : ""}`}>
          {task.title}
        </span>
      </label>
      <div className="-mt-1 flex flex-wrap items-center gap-x-4 pl-8 text-sm">
        {/* Its own line on phones, so the picker and Guide sit together below it. */}
        <span
          className={`max-sm:basis-full ${overdue ? "font-medium text-burgundy" : dueToday ? "font-medium" : "text-dim"}`}
        >
          {dueText(task, done, today)}
        </span>
        {/* Once it's done, "Done by" says who; the picker would be noise. */}
        {done ? null : (
          <span className="relative inline-flex items-center">
            <select
              aria-label={`Who's doing "${task.title}"`}
              value={assignee}
              disabled={pending}
              onChange={(e) => {
                const next = e.target.value;
                setErr(null);
                start(async () => {
                  setAssignee(next);
                  const r = await assignTask(task.id, next);
                  if (!r.ok) setErr("Couldn't save that. Try again.");
                });
              }}
              className={`min-h-11 cursor-pointer appearance-none bg-transparent pr-5 text-base [field-sizing:content] focus:outline-none ${
                assigneeName ? "text-ink" : "text-dim"
              }`}
            >
              {/* Reads as the action while nobody has it, and as the way to clear it once someone does. */}
              <option value="">{assigneeName ? "Nobody" : "Assign"}</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </select>
            <ChevronDown size={14} aria-hidden className="pointer-events-none absolute right-0 text-dim" />
          </span>
        )}
        {task.guide ? (
          <Link
            href={`/admin/playbook/${task.guide.slug}`}
            className="inline-flex min-h-11 items-center gap-1.5 text-burgundy hover:underline"
          >
            <BookOpen size={14} aria-hidden />
            <span>Guide</span>
            <span className="sr-only">: {task.guide.title}</span>
          </Link>
        ) : null}
      </div>
      {err ? (
        <p role="alert" className="pb-2 pl-8 text-sm text-burgundy">
          {err}
        </p>
      ) : null}
    </div>
  );
}
