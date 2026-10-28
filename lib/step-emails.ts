// The words of the two step emails: one when a step is given to someone, and
// the 8 AM reminder of what's overdue, due today and due in the next 3 days.
// Plain text, short, one link.

import { addDaysYmd, formatDay } from "@/lib/planning";

/** Overdue steps older than this stop showing up, so an abandoned plan can't nag forever. */
export const OVERDUE_DAYS = 30;
export const SOON_DAYS = 3;

export type DueStep = { title: string; timelineTitle: string; due: string; done: boolean };

export function bucketSteps<T extends DueStep>(steps: T[], today: string) {
  const oldest = addDaysYmd(today, -OVERDUE_DAYS);
  const last = addDaysYmd(today, SOON_DAYS);
  const open = steps.filter((s) => !s.done).sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
  return {
    overdue: open.filter((s) => s.due < today && s.due >= oldest),
    today: open.filter((s) => s.due === today),
    soon: open.filter((s) => s.due > today && s.due <= last),
  };
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function footer(muteUrl: string): string {
  return `--\nYou get these because you're on the MSA board. Stop them: ${muteUrl}`;
}

export function assignmentEmail(input: {
  toName: string;
  byName: string;
  step: DueStep;
  eventDate: string;
  stepsUrl: string;
  muteUrl: string;
}): { subject: string; text: string } {
  const { step } = input;
  return {
    subject: `Your step: ${step.title}`,
    text: [
      `Hi ${firstName(input.toName)},`,
      "",
      `${firstName(input.byName)} gave you a step for ${step.timelineTitle} (${formatDay(input.eventDate)}):`,
      "",
      step.title,
      `Due ${formatDay(step.due)}`,
      "",
      `Your steps: ${input.stepsUrl}`,
      "",
      footer(input.muteUrl),
    ].join("\n"),
  };
}

export function dailyEmail(input: {
  toName: string;
  today: string;
  steps: DueStep[];
  stepsUrl: string;
  muteUrl: string;
}): { subject: string; text: string } | null {
  const b = bucketSteps(input.steps, input.today);
  if (!b.overdue.length && !b.today.length && !b.soon.length) return null;

  const counts = [
    b.overdue.length ? `${b.overdue.length} overdue` : "",
    b.today.length ? `${b.today.length} due today` : "",
    b.soon.length ? `${b.soon.length} coming up` : "",
  ].filter(Boolean);
  const line = (s: DueStep, due: string) => `- ${s.title} (${s.timelineTitle})${due}`;
  const section = (head: string, rows: string[]) => (rows.length ? [head, ...rows, ""] : []);

  return {
    subject: `Your MSA steps: ${counts.join(", ")}`,
    text: [
      `Hi ${firstName(input.toName)},`,
      "",
      ...section("Overdue", b.overdue.map((s) => line(s, `, was due ${formatDay(s.due)}`))),
      ...section("Due today", b.today.map((s) => line(s, ""))),
      ...section(`Due in the next ${SOON_DAYS} days`, b.soon.map((s) => line(s, `, due ${formatDay(s.due)}`))),
      `Your steps: ${input.stepsUrl}`,
      "",
      footer(input.muteUrl),
    ].join("\n"),
  };
}
