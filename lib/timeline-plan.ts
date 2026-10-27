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

// Calendar days before the event the Event Proposal and the advisor meeting
// are due, by size (SOMeCA: 1, 2, 6 and 8 weeks).
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

/** The general "Meet an advisor" step, not the fundraiser or off-campus ones. */
export function isAdvisorStep(s: Pick<PlanStep, "title" | "whenNote">): boolean {
  return /^meet an advisor\b/i.test(s.title.trim()) && !s.whenNote;
}

/** Lead days for a step, with the Event Proposal and advisor meeting stretched for bigger events. */
export function leadFor(step: PlanStep, size: EventSize): number {
  const base = step.leadDays ?? 0;
  return isProposalStep(step) || isAdvisorStep(step) ? Math.max(base, PROPOSAL_LEAD[size]) : base;
}

/**
 * Dated items for the chosen steps. The Event Proposal is always in and always
 * first; the proposal steps in other categories collapse into it. Other steps
 * sharing a form (a food Purchase Request and a speaker's) stay separate.
 * Due dates never fall before today.
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
  // The advisor meeting comes with every event, sized like the proposal. Off
  // campus, the five-week talk with the advisor is that meeting (SOMeCA's plan
  // an event page asks for one meeting, not two). A fundraiser's meeting is
  // that same general one, whose text covers fundraisers.
  const offCampus = steps.find((s) => chosen.has(s.id) && /off campus/i.test(s.whenNote));
  const advisor = steps.find(isAdvisorStep);
  if (advisor) {
    if (offCampus) chosen.delete(advisor.id);
    else chosen.add(advisor.id);
  }
  if (advisor && chosen.has(advisor.id)) {
    for (const s of steps) if (/fundrais/i.test(s.whenNote) && /advisor/i.test(s.title)) chosen.delete(s.id);
  }
  // Any room or funding step brings its category's "File the Event Proposal
  // first", so the proposal moves up with the room request (the model picked
  // the room steps without it and left the proposal at a week).
  const cats = new Set(steps.filter((s) => chosen.has(s.id)).map((s) => s.categorySlug));
  for (const s of steps) if (isProposalStep(s) && cats.has(s.categorySlug)) chosen.add(s.id);
  const picked = steps
    .filter((s) => chosen.has(s.id))
    .sort((a, b) => a.categorySort - b.categorySort || a.sort - b.sort);

  // Off campus, the proposal is due with the advisor talk, not after it.
  const byForm = new Map<string, { step: PlanStep; lead: number }>();
  const rows: { step: PlanStep; lead: number }[] = [];
  for (const step of picked) {
    const lead = isProposalStep(step)
      ? Math.max(leadFor(step, size), offCampus?.leadDays ?? 0)
      : leadFor(step, size);
    if (isProposalStep(step)) {
      const prev = byForm.get(step.formUrl);
      if (prev) {
        if (lead > prev.lead) prev.lead = lead;
        continue;
      }
    }
    const row = { step: proposal && isProposalStep(step) ? proposal : step, lead };
    if (isProposalStep(step)) byForm.set(step.formUrl, row);
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

/** The largest headcount in the text ("~40 people"), or null when none is given. */
export function headcount(text: string): number | null {
  const counts = [...text.toLowerCase().matchAll(/(\d{1,4})\s*\+?\s*(?:people|students|attendees|guests|ppl|person)/g)].map((m) => +m[1]);
  return counts.length ? Math.max(...counts) : null;
}

export function guessSize(text: string): EventSize {
  const t = text.toLowerCase();
  const n = headcount(t) ?? 0;
  if (n > 250 || /\b(public|community|open to (all|everyone)|conference|gala)\b/.test(t)) return "major";
  if (n > 100) return "large";
  // Speaker events count as mid-scale (SOMeCA), however few come.
  if (n > 50 || RULES.speaker.test(t)) return "mid";
  return "small";
}

const RULES = {
  food: /\b(food|pizza|dinner|lunch|breakfast|snack|iftar|suhoor|cater|halal|eat|boba|dessert|potluck|refreshment|bake|cookie|treats)/,
  money: /\b(fund|budget|money|cost|pay|grant|sponsor|buy|purchase)|\$/,
  // Asking for money the org doesn't have yet; food alone is paid from the org account.
  funding: /\b(fund(?!rais)|budget|grant|sponsor|money)/,
  // "Outside" is left out: an outside speaker still needs a room.
  noRoom: /\b(online|zoom|virtual|outdoors?|beach|park|off.campus)\b/,
  offCampus: /\b(off.campus|beach|park|downtown|trip|hike|retreat)\b/,
  // Sound gear, not a guest speaker.
  gear: /\b(tent|mic|microphone|speakers|projector|av|sound|stage)\b/,
  speaker: /\b(speaker|guest|performer|performance|perform|dj|comedian|lecturer|imam|sheikh|shaykh)\b/,
  fundraiser: /\b(fundrais|bake sale|sell|selling|for sale|charity)/,
  vendor: /\b(cater|restaurant|vendor|dj|photographer|speaker fee|order)/,
  table: /\b(tabl)/,
  college: /\b(college|cowell|stevenson|crown|merrill|porter|kresge|oakes|carson|nine|john r\.? lewis)\b/,
};

/** Lowercased, with "no food" and "without funding" taken out so they don't count. */
function asked(text: string): string {
  return text.toLowerCase().replace(/\b(?:no|without)\s+[a-z]+/g, " ");
}

/**
 * The model's picks without the "when it applies" steps the description never
 * asked for: it added a tent, a library table, a food order and funding nobody
 * mentioned.
 */
export function dropUnasked(steps: PlanStep[], stepIds: string[], text: string): string[] {
  const t = asked(text);
  const byId = new Map(steps.map((s) => [s.id, s]));
  return stepIds.filter((id) => {
    const s = byId.get(id);
    if (!s) return false;
    if (/tent|mic|projector/i.test(s.whenNote)) return RULES.gear.test(t);
    if (/table/i.test(s.whenNote)) return RULES.table.test(t);
    // The food order; the speaker's has its own note.
    if (/^send the purchase request$/i.test(s.title.trim())) return RULES.food.test(t);
    // Asking for money nobody said they need set a speaker event 5 weeks out.
    if (s.categorySlug === "get-funding") return RULES.funding.test(t);
    return true;
  });
}

/**
 * The model's picks plus the steps the rules require that it left out: the
 * flyer, the reminder and the wrap-up for every event; with food, the permit, the order, its receipt and the new-vendor check; with a
 * fundraiser, its advisor meeting; with a funding pick, spending it through the
 * campus account; with any money spent, reimbursements.
 */
export function addRequired(steps: PlanStep[], stepIds: string[], text: string): string[] {
  const t = asked(text);
  const chosen = new Set(stepIds);
  // Promotion and wrap-up apply to every event; the model once left out the thank-you.
  for (const s of steps) {
    if ((s.categorySlug === "promote" || s.categorySlug === "after-the-event") && !s.whenNote.trim()) chosen.add(s.id);
  }
  const titled = (re: RegExp) => steps.find((s) => re.test(s.title.trim()));
  const add = (re: RegExp) => {
    const s = titled(re);
    if (s) chosen.add(s.id);
  };
  if (RULES.food.test(t)) {
    for (const re of [/^get a food permit$/i, /^new vendor\?/i, /^send the purchase request$/i, /^keep the itemized receipt$/i]) add(re);
  }
  if (RULES.fundraiser.test(t)) add(/^fundraiser\?/i);
  const picked = () => steps.filter((s) => chosen.has(s.id));
  if (picked().some((s) => /^pick where the money comes from$/i.test(s.title.trim()))) add(/^spend it through the campus account$/i);
  if (picked().some((s) => s.categorySlug === "purchase-orders" || s.categorySlug === "get-funding")) add(/^file reimbursements$/i);
  return [...chosen];
}

/** Step ids the keyword rules would pick for this description. */
export function ruleStepIds(text: string, steps: PlanStep[]): string[] {
  const t = asked(text);
  const has = (k: keyof typeof RULES) => RULES[k].test(t);
  const food = has("food");
  const money = food || has("money");
  const ok = (s: PlanStep): boolean => {
    const note = s.whenNote.toLowerCase();
    switch (s.categorySlug) {
      case "event-proposal":
        if (/tent|mic|projector/.test(note)) return has("gear");
        if (/off campus/.test(note)) return has("offCampus");
        if (/fundrais/.test(note)) return has("fundraiser");
        if (/speaker|performer/.test(note)) return has("speaker");
        if (/food/.test(note)) return food;
        return true;
      case "reserve-a-room":
        return !has("noRoom");
      case "get-funding":
        if (/college/.test(note)) return has("funding") && has("college");
        return has("funding");
      case "purchase-orders":
        if (/speaker|performer/.test(note)) return has("speaker");
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
