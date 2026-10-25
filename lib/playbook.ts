import { z } from "zod";
import { GUIDE_BODY_MAX, GUIDE_TITLE_MAX } from "./markdown";
import {
  LEAD_DAYS_MAX,
  PLAN_TAG_IDS,
  dueDate,
  includeDependencies,
  scheduleTemplates,
  type PlanTag,
  type TaskTemplate,
} from "./planning";
import { realYmd } from "./event-rules";

export const CARD_LIMIT = 100;
export const cardIdSchema = z.string().regex(/^[a-zA-Z0-9-]{1,64}$/);
export const cardInputSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Give the step a title.")
      .max(GUIDE_TITLE_MAX),
    body: z.string().max(GUIDE_BODY_MAX),
    daysBefore: z.number().int().min(0).max(LEAD_DAYS_MAX),
    tag: z.enum(PLAN_TAG_IDS).nullable(),
    dependencies: z
      .array(cardIdSchema)
      .max(CARD_LIMIT)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Choose each prerequisite once.",
      ),
  })
  .strict();
export type CardInput = z.infer<typeof cardInputSchema>;
export type CardSnapshot = CardInput & {
  sort: number;
  guideSlug: string | null;
  archived: boolean;
};
export type PlaybookCard = CardInput & {
  id: string;
  sort: number;
  guideSlug: string | null;
  revision: number;
};

export function leadLabel(days: number): string {
  if (days === 0) return "Day of";
  if (days % 7 === 0)
    return `${days / 7} ${days === 7 ? "week" : "weeks"} before`;
  return `${days} ${days === 1 ? "day" : "days"} before`;
}

export function validateCardGraph(
  cards: readonly TaskTemplate[],
): string | null {
  try {
    includeDependencies(
      cards.map((c) => c.id),
      cards,
    );
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Check the prerequisites.";
  }
}

export type ScheduledStep = {
  cardId: string;
  title: string;
  dueDate: string;
  dependencies: string[];
  warnings: string[];
};
/** Calendar-day arithmetic, topological ties and honest, uncompressed deadlines. */
export function buildTimeline(
  eventYmd: string,
  ids: readonly string[],
  cards: readonly TaskTemplate[],
  todayYmd: string,
): ScheduledStep[] {
  realYmd.parse(eventYmd);
  realYmd.parse(todayYmd);
  const ordered = includeDependencies(ids, cards);
  const dates = scheduleTemplates(eventYmd, ordered);
  return ordered
    .map((c, index) => {
      const day = dates.get(c.id)!;
      const warnings: string[] = [];
      if (day < todayYmd)
        warnings.push(
          "Deadline has passed. Check with your advisor before committing.",
        );
      else if (
        day <=
        new Date(Date.parse(`${todayYmd}T00:00:00Z`) + 2 * 86400000)
          .toISOString()
          .slice(0, 10)
      )
        warnings.push("Tight deadline: due within two days.");
      if (day < dueDate(eventYmd, c.daysBefore))
        warnings.push("Needed earlier by another step.");
      if ((c.dependencies ?? []).some((id) => dates.get(id) === day))
        warnings.push(
          "A prerequisite is due the same day. Allow time for approval.",
        );
      return {
        cardId: c.id,
        title: c.title,
        dueDate: day,
        dependencies: c.dependencies ?? [],
        warnings,
        index,
      };
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.index - b.index)
    .map((step) => ({
      cardId: step.cardId,
      title: step.title,
      dueDate: step.dueDate,
      dependencies: step.dependencies,
      warnings: step.warnings,
    }));
}

export const reviewedPlanSchema = z
  .object({
    title: z.string().trim().min(1, "Give the event a title.").max(200),
    eventYmd: realYmd,
    description: z.string().max(4000),
    tags: z.array(z.enum(PLAN_TAG_IDS)).max(PLAN_TAG_IDS.length),
    cardIds: z
      .array(cardIdSchema)
      .min(1, "Choose at least one step.")
      .max(CARD_LIMIT),
    requestId: z.string().uuid(),
  })
  .strict();
export type ReviewedPlan = z.infer<typeof reviewedPlanSchema>;
export type AgentSelection = {
  title: string;
  eventYmd: string | null;
  tags: PlanTag[];
  cardIds: string[];
  notes: string[];
};

/** Provider boundary: model output proposes a selection, never writes or dates tasks. */
export interface PlanningAgent {
  propose(input: {
    description: string;
    todayYmd: string;
    cards: readonly PlaybookCard[];
  }): Promise<AgentSelection>;
}
