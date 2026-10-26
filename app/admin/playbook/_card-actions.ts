"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { cardIdSchema, cardInputSchema } from "@/lib/playbook";
import {
  archiveCard,
  cardHistory,
  reorderCards,
  restoreCard,
  saveCard,
} from "./_cards";

function refreshBoard() {
  revalidatePath("/admin/playbook", "layout");
  revalidatePath("/admin/plan", "layout");
}
const revisionSchema = z.number().int().positive();
const invalid = {
  ok: false as const,
  error: "That request wasn't valid. Reload and try again.",
};
export async function savePlaybookCard(
  id: string | null,
  input: unknown,
  revision: number | null,
) {
  const session = await requireAdmin();
  const parsed = cardInputSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? invalid.error,
    };
  if (
    (id !== null &&
      (!cardIdSchema.safeParse(id).success ||
        !revisionSchema.safeParse(revision).success)) ||
    (id === null && revision !== null)
  )
    return invalid;
  const r = await saveCard(db, id, parsed.data, revision, session.user.id);
  if (r.ok) refreshBoard();
  return r;
}
export async function deletePlaybookCard(id: string, revision: number) {
  const session = await requireAdmin();
  if (
    !cardIdSchema.safeParse(id).success ||
    !revisionSchema.safeParse(revision).success
  )
    return invalid;
  const r = await archiveCard(db, id, revision, session.user.id);
  if (r.ok) refreshBoard();
  return r;
}
export async function movePlaybookCards(ids: string[], expected: string[]) {
  const session = await requireAdmin();
  const schema = z.array(cardIdSchema).max(100);
  if (!schema.safeParse(ids).success || !schema.safeParse(expected).success)
    return invalid;
  const r = await reorderCards(db, ids, expected, session.user.id);
  if (r.ok) refreshBoard();
  return r;
}
export async function loadCardHistory(id: string) {
  await requireAdmin();
  if (!cardIdSchema.safeParse(id).success) return invalid;
  return { ok: true as const, versions: await cardHistory(db, id) };
}
export async function restorePlaybookCard(
  id: string,
  versionId: number,
  revision: number,
) {
  const session = await requireAdmin();
  if (
    !cardIdSchema.safeParse(id).success ||
    !revisionSchema.safeParse(versionId).success ||
    !revisionSchema.safeParse(revision).success
  )
    return invalid;
  const r = await restoreCard(db, id, versionId, revision, session.user.id);
  if (r.ok) refreshBoard();
  return r;
}
