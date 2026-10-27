"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth";
import { fail, type ActionFailure } from "@/lib/action-result";
import { hitRateLimit } from "@/lib/rate-limit";
import { toLocalYmd } from "@/lib/time";
import type { TimelineChatTurn } from "@/lib/db/schema";
import { buildItems, isIsoDate } from "@/lib/timeline-plan";
import { planTurn } from "@/lib/timeline-llm";
import {
  createTimeline,
  deleteTimeline,
  loadPlanSteps,
  renameTimeline,
  setItemDone,
  setTimelineDate,
  setTimelinePublic,
} from "@/lib/playbook-db";

type Reply = { ok: true; type: "question"; question: string } | { ok: true; type: "timeline"; id: string };

function cleanChat(chat: unknown): TimelineChatTurn[] {
  if (!Array.isArray(chat)) return [];
  return chat
    .slice(-8)
    .map((t) => ({
      role: t?.role === "assistant" ? ("assistant" as const) : ("user" as const),
      text: String(t?.text ?? "").trim().slice(0, 1500),
    }))
    .filter((t) => t.text.length > 0);
}

export async function sendPlanMessage(input: { chat: TimelineChatTurn[] }): Promise<Reply | ActionFailure> {
  const session = await requireAdmin();
  const userId = session.user.id;
  if (!userId) return fail("no_user", "Sign in again to make a timeline.");
  const chat = cleanChat(input.chat);
  if (chat.at(-1)?.role !== "user") return fail("empty", "Tell me what you're planning first.");

  const limit = await hitRateLimit(db, `plan:${userId}`, { limit: 30, windowMs: 3_600_000 });
  if (!limit.allowed) return fail("rate_limited", "That's a lot of plans for one hour. Try again a little later.");

  const today = toLocalYmd(new Date());
  const steps = await loadPlanSteps(db);
  if (steps.length === 0) return fail("no_playbook", "The playbook is empty, so there's nothing to plan from yet.");

  const turn = await planTurn({
    chat,
    steps,
    today,
    apiKey: process.env.PLANNER_LLM === "off" ? undefined : process.env.DEEPINFRA_API_KEY,
    model: process.env.DEEPINFRA_MODEL || undefined,
  });
  if (turn.type === "question") return { ok: true, type: "question", question: turn.question };

  const items = buildItems(steps, turn.stepIds, turn.eventDate, turn.size, today);
  const row = await createTimeline(db, {
    ownerUserId: userId,
    title: turn.title,
    prompt: chat.filter((t) => t.role === "user").map((t) => t.text).join("\n"),
    eventDate: turn.eventDate,
    size: turn.size,
    items,
    chat,
    source: turn.source,
  });
  revalidatePath("/admin/plan");
  return { ok: true, type: "timeline", id: row.id };
}

async function ownerId(): Promise<string> {
  const session = await requireAdmin();
  if (!session.user.id) throw new Error("unauthorized");
  return session.user.id;
}

function refresh(id: string) {
  revalidatePath("/admin/plan");
  revalidatePath(`/admin/plan/${id}`);
}

export async function toggleItemAction(input: { id: string; itemId: string; done: boolean }) {
  await requireAdmin();
  const ok = await setItemDone(db, input.id, await ownerId(), input.itemId, Boolean(input.done));
  if (!ok) return fail("not_found", "That timeline is gone.");
  refresh(input.id);
  return { ok: true as const };
}

export async function setDateAction(input: { id: string; eventDate: string }) {
  await requireAdmin();
  if (!isIsoDate(input.eventDate)) return fail("bad_date", "Pick a date.");
  const ok = await setTimelineDate(db, input.id, await ownerId(), input.eventDate, toLocalYmd(new Date()));
  if (!ok) return fail("not_found", "That timeline is gone.");
  refresh(input.id);
  return { ok: true as const };
}

export async function setPublicAction(input: { id: string; isPublic: boolean }) {
  await requireAdmin();
  const ok = await setTimelinePublic(db, input.id, await ownerId(), Boolean(input.isPublic));
  if (!ok) return fail("not_found", "That timeline is gone.");
  refresh(input.id);
  return { ok: true as const };
}

export async function renameTimelineAction(input: { id: string; title: string }) {
  await requireAdmin();
  const title = String(input.title ?? "").trim().slice(0, 120);
  if (!title) return fail("title_required", "Give it a name.");
  const ok = await renameTimeline(db, input.id, await ownerId(), title);
  if (!ok) return fail("not_found", "That timeline is gone.");
  refresh(input.id);
  return { ok: true as const };
}

export async function deleteTimelineAction(input: { id: string }) {
  await requireAdmin();
  const ok = await deleteTimeline(db, input.id, await ownerId());
  if (!ok) return fail("not_found", "That timeline is already gone.");
  revalidatePath("/admin/plan");
  return { ok: true as const };
}
