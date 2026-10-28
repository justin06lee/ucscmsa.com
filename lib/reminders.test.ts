import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { item, setupBoard } from "@/test/board";
import { admins, reminderSends } from "@/lib/db/schema";
import type { OutgoingEmail, SendResult } from "@/lib/email";
import { runDailyReminders, sendAssignmentEmail } from "@/lib/reminders";
import { assignStep, setMuted } from "@/lib/step-owners";

let open: { client: { close(): void } } | null = null;
afterEach(() => {
  open?.client.close();
  open = null;
});

const today = "2026-11-18";

async function board() {
  const t = await setupBoard([
    item("a", "File the Event Proposal", "2026-11-12"),
    item("b", "Get a food permit", "2026-11-19"),
    item("c", "Make the flyer", "2026-11-25"),
  ]);
  open = t;
  for (const [itemId, who] of [["a", "u-omar"], ["b", "u-omar"], ["c", "u-aisha"]] as const) {
    await assignStep(t.db, { timelineId: t.tl.id, ownerUserId: "u-aisha", itemId, assigneeUserId: who });
  }
  return t;
}

function outbox(result: SendResult = { sent: true, id: "em" }) {
  const sent: OutgoingEmail[] = [];
  const send = vi.fn(async (e: OutgoingEmail) => {
    sent.push(e);
    return result;
  });
  return { sent, send, ctx: { siteUrl: "https://ucscmsa.com", secret: "s1", send } };
}

describe("runDailyReminders", () => {
  it("emails each person with something close, once a day", async () => {
    const { db } = await board();
    const box = outbox();
    expect(await runDailyReminders(db, today, box.ctx)).toEqual({ sent: 1, already: 0, failed: 0 });
    // Aisha's only step is a week out, so just Omar hears.
    expect(box.sent).toHaveLength(1);
    expect(box.sent[0]).toMatchObject({
      to: "omar@ucsc.edu",
      subject: "Your MSA steps: 1 overdue, 1 coming up",
      idempotencyKey: `daily:u-omar:${today}`,
    });
    expect(box.sent[0].oneClickUrl).toMatch(/^https:\/\/ucscmsa\.com\/api\/notify\/unsubscribe\?u=u-omar&t=/);
    expect(await runDailyReminders(db, today, box.ctx)).toEqual({ sent: 0, already: 1, failed: 0 });
    expect(box.sent).toHaveLength(1);
  });

  it("skips people who muted emails or left the board", async () => {
    const { db } = await board();
    const box = outbox();
    await setMuted(db, "u-omar", true);
    expect((await runDailyReminders(db, today, box.ctx)).sent).toBe(0);
    await setMuted(db, "u-omar", false);
    await db.delete(admins).where(eq(admins.userId, "u-omar"));
    expect((await runDailyReminders(db, today, box.ctx)).sent).toBe(0);
  });

  it("lets a later run try again when sending failed", async () => {
    const { db } = await board();
    const failing = outbox({ sent: false, reason: "failed", detail: "500" });
    expect(await runDailyReminders(db, today, failing.ctx)).toEqual({ sent: 0, already: 0, failed: 1 });
    expect(await db.select().from(reminderSends)).toEqual([]);
    expect((await runDailyReminders(db, today, outbox().ctx)).sent).toBe(1);
  });
});

describe("sendAssignmentEmail", () => {
  it("tells the person who gave them the step", async () => {
    const { db, tl } = await board();
    const box = outbox();
    await sendAssignmentEmail(db, { timelineId: tl.id, itemId: "b", assigneeUserId: "u-omar", byUserId: "u-aisha" }, box.ctx);
    expect(box.sent[0]).toMatchObject({ to: "omar@ucsc.edu", subject: "Your step: Get a food permit" });
    expect(box.sent[0].text).toContain("Aisha gave you a step for Bake Sale (Thu, Dec 3)");
  });

  it("stays quiet for your own steps and for muted people", async () => {
    const { db, tl } = await board();
    const box = outbox();
    expect(await sendAssignmentEmail(db, { timelineId: tl.id, itemId: "c", assigneeUserId: "u-aisha", byUserId: "u-aisha" }, box.ctx)).toBeNull();
    await setMuted(db, "u-omar", true);
    expect(await sendAssignmentEmail(db, { timelineId: tl.id, itemId: "b", assigneeUserId: "u-omar", byUserId: "u-aisha" }, box.ctx)).toBeNull();
    expect(box.send).not.toHaveBeenCalled();
  });
});
