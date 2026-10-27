// Pure timeline logic: turns chosen Playbook steps and an event date into a
// dated checklist, and holds the keyword rules used when the AI model is off
// or fails. Links and instructions always come from the Playbook, never from
// the model.
import type { TimelineItem } from "@/lib/db/schema";
import { EVENT_PROPOSAL_URL } from "@/lib/playbook-content";

export type PlanStep = {
  id: string;
  categorySlug: string;
  categoryName: string;
  categorySort: number;
  sort: number;
  title: string;
  body: string;
  whenNote: string;
  leadDays: number | null;
  formLabel: string;
  formUrl: string;
};

export const SIZES = ["small", "mid", "large", "major"] as const;
export type EventSize = (typeof SIZES)[number];

// Calendar days before the event the Event Proposal is due, by size.
export const PROPOSAL_LEAD: Record<EventSize, number> = { small: 7, mid: 14, large: 42, major: 56 };

const DAY = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s: string): boolean {
  if (!ISO.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY);
}

export function isProposalStep(s: Pick<PlanStep, "formUrl">): boolean {
  return s.formUrl === EVENT_PROPOSAL_URL;
}

/** Lead days for a step, with the Event Proposal stretched for bigger events. */
export function leadFor(step: PlanStep, size: EventSize): number {
  const base = step.leadDays ?? 0;
  return isProposalStep(step) ? Math.max(base, PROPOSAL_LEAD[size]) : base;
}

/**
 * Dated items for the chosen steps. The Event Proposal is always in and always
 * first; steps sharing one form (the proposal appears in several categories)
 * collapse into the earliest. Due dates never fall before today.
 */
export function buildItems(
  steps: PlanStep[],
  stepIds: string[],
  eventDate: string,
  size: EventSize,
  today: string
): TimelineItem[] {
  const chosen = new Set(stepIds);
  const proposal = steps.find(isProposalStep);
  if (proposal) chosen.add(proposal.id);
  const picked = steps
    .filter((s) => chosen.has(s.id))
    .sort((a, b) => a.categorySort - b.categorySort || a.sort - b.sort);

  const byForm = new Map<string, { step: PlanStep; lead: number }>();
  const rows: { step: PlanStep; lead: number }[] = [];
  for (const step of picked) {
    const lead = leadFor(step, size);
    if (step.formUrl) {
      const prev = byForm.get(step.formUrl);
      if (prev) {
        if (lead > prev.lead) prev.lead = lead;
        continue;
      }
    }
    const row = { step: proposal && isProposalStep(step) ? proposal : step, lead };
    if (step.formUrl) byForm.set(step.formUrl, row);
    rows.push(row);
  }

  return rows
    .map(({ step, lead }, i) => {
      const ideal = addDays(eventDate, -lead);
      return {
        order: isProposalStep(step) ? -1 : i,
        item: {
          id: crypto.randomUUID(),
          stepId: step.id,
          category: step.categoryName,
          title: step.title,
          body: step.body,
          whenNote: step.whenNote,
          formLabel: step.formLabel,
          formUrl: step.formUrl,
          leadDays: lead,
          due: ideal < today && lead > 0 ? today : ideal,
          done: false,
        } satisfies TimelineItem,
      };
    })
    .sort((a, b) =>
      a.order === -1 ? -1 : b.order === -1 ? 1 : a.item.due.localeCompare(b.item.due) || a.order - b.order
    )
    .map((r) => r.item);
}

/** Re-dates items when the event date changes, keeping progress. */
export function redateItems(items: TimelineItem[], eventDate: string, today: string): TimelineItem[] {
  return items
    .map((it) => {
      const ideal = addDays(eventDate, -it.leadDays);
      return { ...it, due: ideal < today && it.leadDays > 0 ? today : ideal };
    })
    .sort((a, b) => (isProposalStep(a) ? -1 : isProposalStep(b) ? 1 : a.due.localeCompare(b.due)));
}

// ---------- Keyword rules (fallback) ----------

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Finds an event date in plain words; always in the future (or today). */
export function parseDate(text: string, today: string): string | null {
  const t = text.toLowerCase();
  const future = (iso: string) => (iso < today ? addDays(iso, 365) : iso);
  const year = Number(today.slice(0, 4));
  const pad = (n: number) => String(n).padStart(2, "0");
  const make = (y: number, m: number, d: number) => {
    const iso = `${y}-${pad(m)}-${pad(d)}`;
    return isIsoDate(iso) ? iso : null;
  };

  const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return make(+iso[1], +iso[2], +iso[3]);
  const named = t.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/
  );
  if (named) {
    const d = make(year, MONTHS.indexOf(named[1].slice(0, 3)) + 1, +named[2]);
    if (d) return future(d);
  }
  const dayFirst = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/);
  if (dayFirst) {
    const d = make(year, MONTHS.indexOf(dayFirst[2]) + 1, +dayFirst[1]);
    if (d) return future(d);
  }
  const slash = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slash) {
    const y = slash[3] ? (slash[3].length === 2 ? 2000 + +slash[3] : +slash[3]) : year;
    const d = make(y, +slash[1], +slash[2]);
    if (d) return slash[3] ? d : future(d);
  }
  const inN = t.match(/\bin\s+(\d{1,2}|a|one|two|three|four|five|six)\s+(day|week|month)s?\b/);
  if (inN) {
    const words: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
    const n = words[inN[1]] ?? +inN[1];
    return addDays(today, n * (inN[2] === "day" ? 1 : inN[2] === "week" ? 7 : 30));
  }
  if (/\btomorrow\b/.test(t)) return addDays(today, 1);
  const wd = t.match(/\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (wd) {
    const now = new Date(`${today}T00:00:00Z`).getUTCDay();
    let diff = (WEEKDAYS.indexOf(wd[2]) - now + 7) % 7 || 7;
    if (wd[1] && diff < 7) diff += 7;
    return addDays(today, diff);
  }
  return null;
}

export function guessSize(text: string): EventSize {
  const t = text.toLowerCase();
  const n = Math.max(0, ...[...t.matchAll(/(\d{2,4})\s*\+?\s*(?:people|students|attendees|guests|ppl|person)/g)].map((m) => +m[1]));
  if (n > 250 || /\b(public|community|open to (all|everyone)|conference|gala)\b/.test(t)) return "major";
  if (n > 100) return "large";
  if (n > 50) return "mid";
  return "small";
}

const RULES = {
  food: /\b(food|pizza|dinner|lunch|breakfast|snack|iftar|suhoor|cater|halal|eat|boba|dessert|potluck|refreshment)/,
  money: /\b(fund|budget|money|cost|pay|grant|sponsor|buy|purchase)|\$/,
  // Asking for money the org doesn't have yet; food alone is paid from the org account.
  funding: /\b(fund|budget|grant|sponsor|money)/,
  noRoom: /\b(online|zoom|virtual|outdoor|outside|beach|park|off.campus)\b/,
  offCampus: /\b(off.campus|beach|park|downtown|trip|hike|retreat)\b/,
  gear: /\b(tent|mic|microphone|speaker|projector|av|sound)\b/,
  vendor: /\b(cater|restaurant|vendor|dj|photographer|speaker fee|order)/,
  table: /\b(tabl)/,
  college: /\b(college|cowell|stevenson|crown|merrill|porter|kresge|oakes|carson|nine|john r\.? lewis)\b/,
};

/** Step ids the keyword rules would pick for this description. */
export function ruleStepIds(text: string, steps: PlanStep[]): string[] {
  const t = text.toLowerCase();
  const has = (k: keyof typeof RULES) => RULES[k].test(t);
  const food = has("food");
  const money = food || has("money");
  const ok = (s: PlanStep): boolean => {
    const note = s.whenNote.toLowerCase();
    switch (s.categorySlug) {
      case "event-proposal":
        if (/tent|mic|projector/.test(note)) return has("gear");
        if (/off campus/.test(note)) return has("offCampus");
        return true;
      case "reserve-a-room":
        return !has("noRoom");
      case "get-funding":
        if (/college/.test(note)) return has("funding") && has("college");
        return has("funding");
      case "purchase-orders":
        // Every food order may be from a new vendor; the step's note says when to skip it.
        if (/vendor/.test(note) || /vendor/.test(s.title.toLowerCase())) return food || (money && has("vendor"));
        return money;
      case "promote":
        if (/table/.test(note)) return has("table");
        return true;
      case "after-the-event":
        if (/pocket|reimburs/.test(note + s.title.toLowerCase())) return money;
        return true;
      default:
        return false;
    }
  };
  return steps.filter(ok).map((s) => s.id);
}

export function guessTitle(text: string): string {
  const first = text.trim().split(/[.!?\n]/)[0].replace(/^(we('| a)re|i'm|i am)\s+(planning|hosting|doing|having)\s+/i, "");
  const clean = first.replace(/\s+/g, " ").trim().slice(0, 60);
  if (!clean) return "Event";
  return clean[0].toUpperCase() + clean.slice(1);
}
