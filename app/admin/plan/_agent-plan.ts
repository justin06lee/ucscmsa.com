import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { events, eventPlanSelections, eventTags } from "@/lib/db/schema";
import { includeDependencies } from "@/lib/planning";
import { reviewedPlanSchema, type ReviewedPlan } from "@/lib/playbook";
import { startOfLocalDayUtc, endOfLocalDayUtc } from "@/lib/time";
import { listCards } from "../playbook/_cards";
import { syncPlan } from "./_plan";

/** One transaction, an idempotency key, and date-only drafts: no invented time. */
export async function saveReviewedPlan(
  d: DB,
  input: ReviewedPlan,
  adminId: number,
  todayYmd: string,
  newId: () => string,
) {
  const parsed = reviewedPlanSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false as const, error: "Review the event details first." };
  return d.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(eventPlanSelections)
      .where(eq(eventPlanSelections.requestId, input.requestId));
    if (existing) return { ok: true as const, eventId: existing.eventId };
    if (input.eventYmd < todayYmd)
      return {
        ok: false as const,
        error: "Choose today or a future date to start planning.",
      };
    const cards = await listCards(tx);
    let selected;
    try {
      selected = includeDependencies(input.cardIds, cards);
    } catch {
      return {
        ok: false as const,
        error: "The playbook changed. Review the steps and try again.",
      };
    }
    const eventId = newId();
    await tx
      .insert(events)
      .values({
        id: eventId,
        title: input.title,
        description: input.description,
        startTime: startOfLocalDayUtc(input.eventYmd),
        endTime: endOfLocalDayUtc(input.eventYmd),
        timing: "date_only",
        draft: true,
        createdByAdminId: adminId,
      });
    await tx
      .insert(eventPlanSelections)
      .values({
        eventId,
        cardIds: selected.map((c) => c.id),
        requestId: input.requestId,
      });
    if (input.tags.length)
      await tx
        .insert(eventTags)
        .values([...new Set(input.tags)].map((tag) => ({ eventId, tag })));
    await syncPlan(tx, eventId);
    return { ok: true as const, eventId };
  });
}
