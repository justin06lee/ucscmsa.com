import { asc, desc, eq, isNull, sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { DB } from "@/lib/db/client";
import { cardVersions, taskTemplates, users } from "@/lib/db/schema";
import {
  CARD_LIMIT,
  cardInputSchema,
  validateCardGraph,
  type CardInput,
  type CardSnapshot,
} from "@/lib/playbook";
import { syncAllPlans } from "../plan/_plan";

type Exec = DB | Parameters<Parameters<DB["transaction"]>[0]>[0];
type Row = typeof taskTemplates.$inferSelect;
function snapshot(c: Row): CardSnapshot {
  return {
    title: c.title,
    body: c.body,
    daysBefore: c.daysBefore,
    tag: c.tag,
    dependencies: c.dependencies,
    sort: c.sort,
    guideSlug: c.guideSlug,
    archived: c.archivedAt !== null,
  };
}
const conflict = {
  ok: false as const,
  error: "This step changed in another tab. Reload before saving.",
};
export async function listCards(d: Exec, archived = false) {
  return d
    .select()
    .from(taskTemplates)
    .where(
      archived
        ? sql`${taskTemplates.archivedAt} IS NOT NULL`
        : isNull(taskTemplates.archivedAt),
    )
    .orderBy(asc(taskTemplates.sort), asc(taskTemplates.id));
}
async function version(d: Exec, c: Row, userId: string) {
  await d
    .insert(cardVersions)
    .values({ cardId: c.id, snapshot: snapshot(c), createdByUserId: userId });
}
export async function saveCard(
  d: DB,
  id: string | null,
  input: CardInput,
  revision: number | null,
  userId: string,
) {
  const parsed = cardInputSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Check the step.",
    };
  return d.transaction(async (tx) => {
    const cards = await listCards(tx);
    const current = id ? cards.find((c) => c.id === id) : null;
    if (id && (!current || current.revision !== revision)) return conflict;
    if (!id && cards.length >= CARD_LIMIT)
      return {
        ok: false as const,
        error: "The board can hold up to 100 steps.",
      };
    const next = {
      ...parsed.data,
      id: id ?? ulid(),
      revision: (current?.revision ?? 0) + 1,
      sort: current?.sort ?? Math.max(0, ...cards.map((c) => c.sort)) + 10,
      guideSlug: current?.guideSlug ?? null,
      archivedAt: null,
    };
    const graphError = validateCardGraph([
      ...cards.filter((c) => c.id !== id),
      next,
    ]);
    if (graphError) return { ok: false as const, error: graphError };
    if (current)
      await tx
        .update(taskTemplates)
        .set(next)
        .where(eq(taskTemplates.id, current.id));
    else await tx.insert(taskTemplates).values(next);
    await version(tx, next, userId);
    await syncAllPlans(tx);
    return { ok: true as const, id: next.id };
  });
}
export async function archiveCard(
  d: DB,
  id: string,
  revision: number,
  userId: string,
) {
  return d.transaction(async (tx) => {
    const cards = await listCards(tx);
    const current = cards.find((c) => c.id === id);
    if (!current || current.revision !== revision) return conflict;
    if (cards.some((c) => c.dependencies.includes(id)))
      return {
        ok: false as const,
        error:
          "Another step depends on this one. Remove that dependency first.",
      };
    const next = {
      ...current,
      archivedAt: new Date(),
      revision: current.revision + 1,
    };
    await tx
      .update(taskTemplates)
      .set({ archivedAt: next.archivedAt, revision: next.revision })
      .where(eq(taskTemplates.id, id));
    await version(tx, next, userId);
    await syncAllPlans(tx);
    return { ok: true as const };
  });
}
export async function reorderCards(
  d: DB,
  ids: string[],
  expected: string[],
  userId: string,
) {
  return d.transaction(async (tx) => {
    const cards = await listCards(tx);
    if (
      JSON.stringify(cards.map((c) => c.id)) !== JSON.stringify(expected) ||
      ids.length !== cards.length ||
      new Set(ids).size !== cards.length ||
      ids.some((id) => !cards.some((c) => c.id === id))
    )
      return conflict;
    for (const [i, id] of ids.entries()) {
      const c = cards.find((c) => c.id === id)!;
      if (c.sort === i * 10) continue;
      const next = { ...c, sort: i * 10, revision: c.revision + 1 };
      await tx
        .update(taskTemplates)
        .set({ sort: next.sort, revision: next.revision })
        .where(eq(taskTemplates.id, id));
      await version(tx, next, userId);
    }
    return { ok: true as const };
  });
}
export async function cardHistory(d: Exec, id: string) {
  const rows = await d
    .select({
      id: cardVersions.id,
      snapshot: cardVersions.snapshot,
      when: cardVersions.createdAt,
      name: users.name,
      email: users.email,
    })
    .from(cardVersions)
    .leftJoin(users, eq(users.id, cardVersions.createdByUserId))
    .where(eq(cardVersions.cardId, id))
    .orderBy(desc(cardVersions.id))
    .limit(20);
  return rows.map((r) => ({
    id: r.id,
    snapshot: r.snapshot,
    when: r.when.toISOString(),
    by: r.name || r.email?.split("@")[0] || "Board seed",
  }));
}
export async function restoreCard(
  d: DB,
  id: string,
  versionId: number,
  revision: number,
  userId: string,
) {
  return d.transaction(async (tx) => {
    const [c] = await tx
      .select()
      .from(taskTemplates)
      .where(eq(taskTemplates.id, id));
    const [v] = await tx
      .select()
      .from(cardVersions)
      .where(eq(cardVersions.id, versionId));
    if (!c || !v || v.cardId !== id || c.revision !== revision) return conflict;
    const active = await listCards(tx);
    if (c.archivedAt && active.length >= CARD_LIMIT)
      return {
        ok: false as const,
        error: "The board can hold up to 100 steps.",
      };
    const next = {
      ...c,
      ...v.snapshot,
      archivedAt: null,
      revision: c.revision + 1,
    };
    const graphError = validateCardGraph([
      ...active.filter((r) => r.id !== id),
      next,
    ]);
    if (graphError) return { ok: false as const, error: graphError };
    await tx
      .update(taskTemplates)
      .set({
        title: next.title,
        body: next.body,
        daysBefore: next.daysBefore,
        tag: next.tag,
        dependencies: next.dependencies,
        sort: next.sort,
        guideSlug: next.guideSlug,
        archivedAt: null,
        revision: next.revision,
      })
      .where(eq(taskTemplates.id, id));
    await version(tx, next, userId);
    await syncAllPlans(tx);
    return { ok: true as const };
  });
}
