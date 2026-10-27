"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth";
import { fail, type ActionFailure } from "@/lib/action-result";
import {
  addCategory,
  addStep,
  categorySlugOf,
  getStep,
  moveCategory,
  moveStep,
  saveStep,
  setCategoryArchived,
  setStepArchived,
  updateCategory,
  type StepInput,
} from "@/lib/playbook-db";

type Ok = { ok: true; slug?: string };

function clean(v: unknown, max: number): string {
  return String(v ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

function readStep(input: Record<string, unknown>): StepInput | ActionFailure {
  const title = clean(input.title, 120);
  if (!title) return fail("title_required", "Give the step a short title.");
  const leadRaw = clean(input.leadDays, 6);
  let leadDays: number | null = null;
  if (leadRaw !== "") {
    const n = Number(leadRaw);
    if (!Number.isInteger(n) || n < -60 || n > 120) {
      return fail("lead_days", "Days before should be a whole number from -60 to 120.");
    }
    leadDays = n;
  }
  const formUrl = clean(input.formUrl, 600);
  if (formUrl && !/^https:\/\/\S+$/.test(formUrl)) {
    return fail("form_url", "The form link should start with https://");
  }
  return {
    title,
    body: clean(input.body, 6000),
    whenNote: clean(input.whenNote, 160),
    leadDays,
    formLabel: formUrl ? clean(input.formLabel, 80) || "Open the form" : "",
    formUrl,
  };
}

function refresh(slug?: string | null) {
  revalidatePath("/admin/playbook");
  if (slug) revalidatePath(`/admin/playbook/${slug}`);
}

export async function addCategoryAction(input: { name: string; summary: string }): Promise<Ok | ActionFailure> {
  const session = await requireAdmin();
  const name = clean(input.name, 60);
  if (!name) return fail("name_required", "Give the category a name.");
  const row = await addCategory(db, { name, summary: clean(input.summary, 160) }, session.user.id ?? null);
  refresh();
  return { ok: true, slug: row.slug };
}

export async function updateCategoryAction(input: {
  id: string;
  name: string;
  summary: string;
}): Promise<Ok | ActionFailure> {
  const session = await requireAdmin();
  const name = clean(input.name, 60);
  if (!name) return fail("name_required", "Give the category a name.");
  const ok = await updateCategory(db, input.id, { name, summary: clean(input.summary, 160) }, session.user.id ?? null);
  if (!ok) return fail("not_found", "That category is gone. Reload the page.");
  refresh(await categorySlugOf(db, input.id));
  return { ok: true };
}

export async function moveCategoryAction(input: { id: string; by: number }): Promise<Ok | ActionFailure> {
  await requireAdmin();
  await moveCategory(db, input.id, Number(input.by) || 0);
  refresh();
  return { ok: true };
}

export async function archiveCategoryAction(input: { id: string; archived: boolean }): Promise<Ok | ActionFailure> {
  const session = await requireAdmin();
  await setCategoryArchived(db, input.id, input.archived, session.user.id ?? null);
  refresh(await categorySlugOf(db, input.id));
  return { ok: true };
}

export async function addStepAction(input: Record<string, unknown> & { categoryId: string }): Promise<Ok | ActionFailure> {
  const session = await requireAdmin();
  const step = readStep(input);
  if ("ok" in step) return step;
  await addStep(db, input.categoryId, step, session.user.id ?? null);
  refresh(await categorySlugOf(db, input.categoryId));
  return { ok: true };
}

export async function saveStepAction(
  input: Record<string, unknown> & { id: string; revision: number }
): Promise<Ok | ActionFailure> {
  const session = await requireAdmin();
  const step = readStep(input);
  if ("ok" in step) return step;
  const saved = await saveStep(db, input.id, Number(input.revision), step, session.user.id ?? null);
  const row = await getStep(db, input.id);
  if (!saved) {
    return fail("stale", "Someone else changed this step. Reload the page to see their version.");
  }
  refresh(row ? await categorySlugOf(db, row.categoryId) : null);
  return { ok: true };
}

export async function moveStepAction(input: { id: string; by: number }): Promise<Ok | ActionFailure> {
  await requireAdmin();
  await moveStep(db, input.id, Number(input.by) || 0);
  const row = await getStep(db, input.id);
  refresh(row ? await categorySlugOf(db, row.categoryId) : null);
  return { ok: true };
}

export async function archiveStepAction(input: { id: string; archived: boolean }): Promise<Ok | ActionFailure> {
  const session = await requireAdmin();
  await setStepArchived(db, input.id, input.archived, session.user.id ?? null);
  const row = await getStep(db, input.id);
  refresh(row ? await categorySlugOf(db, row.categoryId) : null);
  return { ok: true };
}
