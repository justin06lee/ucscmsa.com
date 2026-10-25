"use server";
import { z } from "zod";
import { ulid } from "ulid";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { requireAdmin, requireAdminId } from "@/lib/auth";
import { getPlanningAgent } from "@/lib/planning-agent";
import { reviewedPlanSchema } from "@/lib/playbook";
import { PLAN_TAG_IDS, includeDependencies } from "@/lib/planning";
import { realYmd } from "@/lib/event-rules";
import { toLocalYmd } from "@/lib/time";
import { listCards } from "../playbook/_cards";
import { saveReviewedPlan } from "./_agent-plan";

export async function suggestEventPlan(description: string) {
  await requireAdmin();
  const parsed = z
    .string()
    .trim()
    .min(5, "Tell us a little more about the event.")
    .max(4000)
    .safeParse(description);
  if (!parsed.success)
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Check the description.",
    };
  const cards = await listCards(db);
  const todayYmd = toLocalYmd(new Date());
  try {
    const proposal = await getPlanningAgent().propose({
      description: parsed.data,
      todayYmd,
      cards,
    });
    // The provider is untrusted. It can only select known cards, never write tasks.
    const selected = z
      .object({
        title: z.string().min(1).max(200),
        eventYmd: realYmd.nullable(),
        tags: z.array(z.enum(PLAN_TAG_IDS)).max(6),
        cardIds: z.array(z.string()).max(100),
        notes: z.array(z.string().max(500)).max(20),
      })
      .parse(proposal);
    const included = includeDependencies(selected.cardIds, cards);
    return {
      ok: true as const,
      proposal: { ...selected, cardIds: included.map((c) => c.id) },
      requestId: crypto.randomUUID(),
    };
  } catch {
    return {
      ok: false as const,
      error:
        "The planner couldn't finish. Try again, or plan the event with the form.",
    };
  }
}

export async function createEventFromPlan(input: unknown) {
  const adminId = await requireAdminId();
  const parsed = reviewedPlanSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Review the plan first.",
    };
  // Validate card selection again against current storage, not a client preview.
  const r = await saveReviewedPlan(
    db,
    parsed.data,
    adminId,
    toLocalYmd(new Date()),
    ulid,
  );
  if (r.ok) {
    revalidatePath("/admin/plan");
    revalidatePath("/admin");
  }
  return r;
}
