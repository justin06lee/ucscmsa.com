import type { PlanTag } from "@/lib/planning";
import type { PlaybookCard } from "@/lib/playbook";

/** The playbook's categories: plain names for the things an organizer is trying to do. Each owns the steps with its tag; "every" holds the untagged steps. */
export const PLAYBOOK_TASKS: readonly {
  slug: string;
  tag: PlanTag | null;
  name: string;
  line: string;
}[] = [
  { slug: "every", tag: null, name: "Hold an event", line: "What every event needs, from the proposal to the reminder post." },
  { slug: "funding", tag: "funding", name: "Get funding", line: "Ask the university to pay for your event." },
  { slug: "room", tag: "room", name: "Book a room", line: "Reserve a room on campus." },
  { slug: "food", tag: "food", name: "Serve food", line: "Pay a vendor for food with university money." },
  { slug: "big", tag: "big", name: "Big event", line: "Extra steps for a large or high-profile event." },
  { slug: "offcampus", tag: "offcampus", name: "Go off campus", line: "Extra steps for an event away from campus." },
  { slug: "collab", tag: "collab", name: "Work with another group", line: "Plan an event together with another org." },
];

export type PlaybookTask = (typeof PLAYBOOK_TASKS)[number];

export function taskBySlug(slug: string): PlaybookTask | undefined {
  return PLAYBOOK_TASKS.find((t) => t.slug === slug);
}

export function taskForTag(tag: string | null): PlaybookTask | undefined {
  return PLAYBOOK_TASKS.find((t) => t.tag === tag);
}

/** A category's steps, in the playbook's saved order. */
export function stepsFor<C extends Pick<PlaybookCard, "tag">>(cards: readonly C[], task: PlaybookTask): C[] {
  return cards.filter((c) => c.tag === task.tag);
}

/**
 * The full saved order after swapping one step with its neighbour inside its category.
 * Other categories keep their places; null when the step can't move that way.
 */
export function moveWithinTask<C extends Pick<PlaybookCard, "id" | "tag">>(
  cards: readonly C[],
  id: string,
  by: -1 | 1,
): C[] | null {
  const from = cards.findIndex((c) => c.id === id);
  if (from < 0) return null;
  const slots = cards.flatMap((c, i) => (c.tag === cards[from].tag ? [i] : []));
  const at = slots.indexOf(from);
  const to = slots[at + by];
  if (to === undefined) return null;
  const next = [...cards];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
