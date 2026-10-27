import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import {
  playbookCategories,
  playbookSteps,
  timelines,
  type TimelineChatTurn,
  type TimelineItem,
} from "@/lib/db/schema";
import type { SeedCategory } from "@/lib/playbook-content";
import { redateItems, type EventSize, type PlanStep } from "@/lib/timeline-plan";

export type Category = typeof playbookCategories.$inferSelect;
export type Step = typeof playbookSteps.$inferSelect;
export type Timeline = typeof timelines.$inferSelect;
export type CategoryRow = Category & { stepCount: number };

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "category"
  );
}

export function newShareSlug(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return Buffer.from(bytes).toString("base64url");
}

// ---- Categories -----------------------------------------------------------

export async function listCategories(db: DB, opts: { archived?: boolean } = {}): Promise<CategoryRow[]> {
  const rows = await db
    .select({
      category: playbookCategories,
      stepCount: sql<number>`(select count(*) from ${playbookSteps} s where s.category_id = ${playbookCategories.id} and s.archived_at is null)`,
    })
    .from(playbookCategories)
    .where(
      opts.archived
        ? sql`${playbookCategories.archivedAt} is not null`
        : isNull(playbookCategories.archivedAt)
    )
    .orderBy(asc(playbookCategories.sort), asc(playbookCategories.name));
  return rows.map((r) => ({ ...r.category, stepCount: Number(r.stepCount) }));
}

export async function getCategory(
  db: DB,
  slug: string
): Promise<{ category: Category; steps: Step[]; archivedSteps: Step[] } | null> {
  const [category] = await db
    .select()
    .from(playbookCategories)
    .where(and(eq(playbookCategories.slug, slug), isNull(playbookCategories.archivedAt)));
  if (!category) return null;
  const all = await db
    .select()
    .from(playbookSteps)
    .where(eq(playbookSteps.categoryId, category.id))
    .orderBy(asc(playbookSteps.sort), asc(playbookSteps.title));
  return {
    category,
    steps: all.filter((s) => !s.archivedAt),
    archivedSteps: all.filter((s) => s.archivedAt),
  };
}

export async function addCategory(
  db: DB,
  input: { name: string; summary: string },
  userId: string | null
): Promise<Category> {
  const base = slugify(input.name);
  const taken = new Set(
    (await db.select({ slug: playbookCategories.slug }).from(playbookCategories)).map((r) => r.slug)
  );
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${playbookCategories.sort}), 0)` })
    .from(playbookCategories);
  const [row] = await db
    .insert(playbookCategories)
    .values({ slug, name: input.name, summary: input.summary, sort: Number(max) + 1, updatedByUserId: userId })
    .returning();
  return row;
}

export async function updateCategory(
  db: DB,
  id: string,
  input: { name: string; summary: string },
  userId: string | null
): Promise<boolean> {
  const res = await db
    .update(playbookCategories)
    .set({ name: input.name, summary: input.summary, updatedAt: new Date(), updatedByUserId: userId })
    .where(eq(playbookCategories.id, id))
    .returning({ id: playbookCategories.id });
  return res.length > 0;
}

export async function setCategoryArchived(db: DB, id: string, archived: boolean, userId: string | null) {
  await db
    .update(playbookCategories)
    .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date(), updatedByUserId: userId })
    .where(eq(playbookCategories.id, id));
}

// Swap with the neighbour above (-1) or below (+1) among live categories.
export async function moveCategory(db: DB, id: string, dir: -1 | 1): Promise<boolean> {
  const rows = await listCategories(db);
  return swapSort(db, rows, id, dir, async (row, sort) => {
    await db.update(playbookCategories).set({ sort }).where(eq(playbookCategories.id, row.id));
  });
}

async function swapSort<T extends { id: string }>(
  _db: DB,
  rows: T[],
  id: string,
  dir: -1 | 1,
  write: (row: T, sort: number) => Promise<void>
): Promise<boolean> {
  const i = rows.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= rows.length) return false;
  const next = [...rows];
  [next[i], next[j]] = [next[j], next[i]];
  // Rewrite every sort as its index so ties and gaps never stall a move.
  for (let k = 0; k < next.length; k++) await write(next[k], k + 1);
  return true;
}

// ---- Steps ----------------------------------------------------------------

export type StepInput = {
  title: string;
  body: string;
  whenNote: string;
  leadDays: number | null;
  formLabel: string;
  formUrl: string;
};

export async function addStep(db: DB, categoryId: string, input: StepInput, userId: string | null): Promise<Step> {
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${playbookSteps.sort}), 0)` })
    .from(playbookSteps)
    .where(eq(playbookSteps.categoryId, categoryId));
  const [row] = await db
    .insert(playbookSteps)
    .values({ ...input, categoryId, sort: Number(max) + 1, updatedByUserId: userId })
    .returning();
  return row;
}

// Saves only when nobody saved in between: false means the revision moved on.
export async function saveStep(
  db: DB,
  id: string,
  revision: number,
  input: StepInput,
  userId: string | null
): Promise<boolean> {
  const res = await db
    .update(playbookSteps)
    .set({ ...input, revision: revision + 1, updatedAt: new Date(), updatedByUserId: userId })
    .where(and(eq(playbookSteps.id, id), eq(playbookSteps.revision, revision)))
    .returning({ id: playbookSteps.id });
  return res.length > 0;
}

export async function setStepArchived(db: DB, id: string, archived: boolean, userId: string | null) {
  await db
    .update(playbookSteps)
    .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date(), updatedByUserId: userId })
    .where(eq(playbookSteps.id, id));
}

// Moves a step within its own category only.
export async function moveStep(db: DB, id: string, dir: -1 | 1): Promise<boolean> {
  const [step] = await db.select().from(playbookSteps).where(eq(playbookSteps.id, id));
  if (!step) return false;
  const rows = await db
    .select()
    .from(playbookSteps)
    .where(and(eq(playbookSteps.categoryId, step.categoryId), isNull(playbookSteps.archivedAt)))
    .orderBy(asc(playbookSteps.sort), asc(playbookSteps.title));
  return swapSort(db, rows, id, dir, async (row, sort) => {
    await db.update(playbookSteps).set({ sort }).where(eq(playbookSteps.id, row.id));
  });
}

export async function getStep(db: DB, id: string): Promise<Step | null> {
  const [row] = await db.select().from(playbookSteps).where(eq(playbookSteps.id, id));
  return row ?? null;
}

export async function categorySlugOf(db: DB, categoryId: string): Promise<string | null> {
  const [row] = await db
    .select({ slug: playbookCategories.slug })
    .from(playbookCategories)
    .where(eq(playbookCategories.id, categoryId));
  return row?.slug ?? null;
}

// Live steps of live categories, in reading order: what the planner may use.
export async function loadPlanSteps(db: DB): Promise<PlanStep[]> {
  const rows = await db
    .select({ s: playbookSteps, c: playbookCategories })
    .from(playbookSteps)
    .innerJoin(playbookCategories, eq(playbookSteps.categoryId, playbookCategories.id))
    .where(and(isNull(playbookSteps.archivedAt), isNull(playbookCategories.archivedAt)))
    .orderBy(asc(playbookCategories.sort), asc(playbookSteps.sort));
  return rows.map(({ s, c }) => ({
    id: s.id,
    categorySlug: c.slug,
    categoryName: c.name,
    categorySort: c.sort,
    sort: s.sort,
    title: s.title,
    body: s.body,
    whenNote: s.whenNote,
    leadDays: s.leadDays,
    formLabel: s.formLabel,
    formUrl: s.formUrl,
  }));
}

// Fills an empty playbook; does nothing once any category exists.
export async function seedPlaybook(db: DB, seed: SeedCategory[]): Promise<boolean> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(playbookCategories);
  if (Number(n) > 0) return false;
  for (const [ci, c] of seed.entries()) {
    const [cat] = await db
      .insert(playbookCategories)
      .values({ slug: c.slug, name: c.name, summary: c.summary, sort: ci + 1 })
      .returning();
    for (const [si, s] of c.steps.entries()) {
      await db.insert(playbookSteps).values({
        categoryId: cat.id,
        sort: si + 1,
        title: s.title,
        body: s.body,
        whenNote: s.whenNote ?? "",
        leadDays: s.leadDays,
        formLabel: s.formLabel ?? "",
        formUrl: s.formUrl ?? "",
      });
    }
  }
  return true;
}

// ---- Timelines ------------------------------------------------------------

export async function createTimeline(
  db: DB,
  input: {
    ownerUserId: string;
    title: string;
    prompt: string;
    eventDate: string;
    size: EventSize;
    items: TimelineItem[];
    chat: TimelineChatTurn[];
    source: "ai" | "rules";
  }
): Promise<Timeline> {
  const [row] = await db
    .insert(timelines)
    .values({ ...input, shareSlug: newShareSlug() })
    .returning();
  return row;
}

export async function getOwnTimeline(db: DB, id: string, ownerUserId: string): Promise<Timeline | null> {
  const [row] = await db
    .select()
    .from(timelines)
    .where(and(eq(timelines.id, id), eq(timelines.ownerUserId, ownerUserId)));
  return row ?? null;
}

export async function listOwnTimelines(db: DB, ownerUserId: string): Promise<Timeline[]> {
  return db
    .select()
    .from(timelines)
    .where(eq(timelines.ownerUserId, ownerUserId))
    .orderBy(desc(timelines.createdAt));
}

export async function getPublicTimeline(db: DB, shareSlug: string): Promise<Timeline | null> {
  const [row] = await db
    .select()
    .from(timelines)
    .where(and(eq(timelines.shareSlug, shareSlug), eq(timelines.isPublic, true)));
  return row ?? null;
}

async function writeOwn(db: DB, id: string, ownerUserId: string, set: Partial<typeof timelines.$inferInsert>) {
  const res = await db
    .update(timelines)
    .set({ ...set, updatedAt: new Date() })
    .where(and(eq(timelines.id, id), eq(timelines.ownerUserId, ownerUserId)))
    .returning({ id: timelines.id });
  return res.length > 0;
}

export async function setItemDone(db: DB, id: string, ownerUserId: string, itemId: string, done: boolean) {
  const t = await getOwnTimeline(db, id, ownerUserId);
  if (!t) return false;
  const items = t.items.map((it) => (it.id === itemId ? { ...it, done } : it));
  return writeOwn(db, id, ownerUserId, { items });
}

export async function setTimelineDate(db: DB, id: string, ownerUserId: string, eventDate: string, today: string) {
  const t = await getOwnTimeline(db, id, ownerUserId);
  if (!t) return false;
  return writeOwn(db, id, ownerUserId, { eventDate, items: redateItems(t.items, eventDate, today) });
}

export async function setTimelinePublic(db: DB, id: string, ownerUserId: string, isPublic: boolean) {
  return writeOwn(db, id, ownerUserId, { isPublic });
}

export async function renameTimeline(db: DB, id: string, ownerUserId: string, title: string) {
  return writeOwn(db, id, ownerUserId, { title });
}

export async function deleteTimeline(db: DB, id: string, ownerUserId: string) {
  const res = await db
    .delete(timelines)
    .where(and(eq(timelines.id, id), eq(timelines.ownerUserId, ownerUserId)))
    .returning({ id: timelines.id });
  return res.length > 0;
}
