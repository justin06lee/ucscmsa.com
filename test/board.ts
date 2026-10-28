import { createTestDb } from "@/test/db";
import { admins, users, type TimelineItem } from "@/lib/db/schema";
import { createTimeline } from "@/lib/playbook-db";

export function item(id: string, title: string, due: string, done = false): TimelineItem {
  return { id, stepId: null, category: "c", title, body: "", whenNote: "", formLabel: "", formUrl: "", leadDays: 7, due, done };
}

/** Aisha and Omar on the board, Yusuf not; Aisha's bake sale timeline with two steps. */
export async function setupBoard(items: TimelineItem[] = [
  item("a", "File the Event Proposal", "2026-11-12"),
  item("b", "Get a food permit", "2026-11-19"),
]) {
  const t = await createTestDb();
  await t.db.insert(users).values([
    { id: "u-aisha", email: "aisha@ucsc.edu", name: "Aisha Karim" },
    { id: "u-omar", email: "omar@ucsc.edu", name: "Omar Farouk" },
    { id: "u-yusuf", email: "yusuf@ucsc.edu", name: "Yusuf Rahman" },
  ]);
  await t.db.insert(admins).values([{ userId: "u-aisha" }, { userId: "u-omar" }]);
  const tl = await createTimeline(t.db, {
    ownerUserId: "u-aisha",
    title: "Bake Sale",
    prompt: "bake sale",
    eventDate: "2026-12-03",
    size: "small",
    items,
    chat: [],
    source: "rules",
  });
  return { ...t, tl };
}
