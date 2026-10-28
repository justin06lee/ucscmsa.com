"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth";
import { fail } from "@/lib/action-result";
import { setMuted } from "@/lib/step-owners";

export async function setEmailsAction(input: { on: boolean }) {
  const session = await requireAdmin();
  if (!session.user.id) return fail("no_user", "Sign in again.");
  await setMuted(db, session.user.id, !input.on);
  revalidatePath("/admin/steps");
  return { ok: true as const };
}
