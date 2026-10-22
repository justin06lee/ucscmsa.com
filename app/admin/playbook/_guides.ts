import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/lib/db/client";
import { guideVersions, guides, users } from "@/lib/db/schema";
import { GUIDE_BODY_MAX, GUIDE_TITLE_MAX } from "@/lib/markdown";

// Database half of the playbook: guides are markdown, and every save keeps a
// version so a bad edit can be put back.

export const guideInputSchema = z.object({
  title: z.string().trim().min(1, "A guide needs a title").max(GUIDE_TITLE_MAX, "That title is too long"),
  body: z.string().max(GUIDE_BODY_MAX, "That guide is too long"),
});

// Flat columns, not a nested { name, email } object: Drizzle turns a nested
// left-joined object into null when its first column is null.
function displayName(name: string | null, email: string | null): string | null {
  if (!email) return null;
  return name?.trim() || email.split("@")[0];
}

export async function listGuides(d: DB) {
  return d
    .select({ slug: guides.slug, title: guides.title, body: guides.body })
    .from(guides)
    .orderBy(asc(guides.sort), asc(guides.title));
}

export async function getGuide(d: DB, slug: string) {
  const [row] = await d
    .select({ guide: guides, editorName: users.name, editorEmail: users.email })
    .from(guides)
    .leftJoin(users, eq(users.id, guides.updatedByUserId))
    .where(eq(guides.slug, slug))
    .limit(1);
  if (!row) return null;
  return { ...row.guide, editedBy: displayName(row.editorName, row.editorEmail) };
}

/** Earlier versions, newest first, without the current one. */
export async function getVersions(d: DB, slug: string, limit = 20) {
  const rows = await d
    .select({
      id: guideVersions.id,
      title: guideVersions.title,
      body: guideVersions.body,
      createdAt: guideVersions.createdAt,
      editorName: users.name,
      editorEmail: users.email,
    })
    .from(guideVersions)
    .leftJoin(users, eq(users.id, guideVersions.createdByUserId))
    .where(eq(guideVersions.guideSlug, slug))
    .orderBy(desc(guideVersions.id))
    .limit(limit + 1);
  // The newest version is what the guide shows now.
  return rows.slice(1).map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    createdAt: r.createdAt,
    editedBy: displayName(r.editorName, r.editorEmail),
  }));
}

export async function saveGuide(
  d: DB,
  slug: string,
  input: { title: string; body: string },
  userId: string,
) {
  const parsed = guideInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "invalid" };
  const { title, body } = parsed.data;
  return d.transaction(async (tx) => {
    const [current] = await tx.select().from(guides).where(eq(guides.slug, slug)).limit(1);
    if (!current) return { ok: false as const, error: "not_found" };
    if (current.title === title && current.body === body) return { ok: true as const, changed: false };
    const now = new Date();
    await tx
      .update(guides)
      .set({ title, body, updatedAt: now, updatedByUserId: userId })
      .where(eq(guides.slug, slug));
    await tx.insert(guideVersions).values({ guideSlug: slug, title, body, createdAt: now, createdByUserId: userId });
    return { ok: true as const, changed: true };
  });
}

/** Puts an earlier version back, as a new save, so the restore can be undone too. */
export async function restoreVersion(d: DB, slug: string, versionId: number, userId: string) {
  const [v] = await d.select().from(guideVersions).where(eq(guideVersions.id, versionId)).limit(1);
  if (!v || v.guideSlug !== slug) return { ok: false as const, error: "not_found" };
  return saveGuide(d, slug, { title: v.title, body: v.body }, userId);
}
