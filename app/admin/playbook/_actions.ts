"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth";
import { restoreVersion, saveGuide as saveGuideDb } from "./_guides";

// Every action checks for an admin itself: server actions are reachable by a
// direct POST, whatever the page around them checked.

const slugSchema = z.string().regex(/^[a-z0-9-]{1,64}$/);

function revalidateGuide(slug: string) {
  revalidatePath("/admin/playbook");
  revalidatePath(`/admin/playbook/${slug}`);
  revalidatePath(`/admin/playbook/${slug}/edit`);
}

export async function saveGuide(slug: string, fd: FormData) {
  const session = await requireAdmin();
  const s = slugSchema.safeParse(slug);
  if (!s.success) return { ok: false as const, error: "not_found" };
  const r = await saveGuideDb(
    db,
    s.data,
    { title: String(fd.get("title") ?? ""), body: String(fd.get("body") ?? "") },
    session.user.id,
  );
  if (r.ok) revalidateGuide(s.data);
  return r;
}

export async function restoreGuide(slug: string, versionId: number) {
  const session = await requireAdmin();
  const s = slugSchema.safeParse(slug);
  const v = z.number().int().positive().safeParse(versionId);
  if (!s.success || !v.success) return { ok: false as const, error: "not_found" };
  const r = await restoreVersion(db, s.data, v.data, session.user.id);
  if (r.ok) revalidateGuide(s.data);
  return r;
}
