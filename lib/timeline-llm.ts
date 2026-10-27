// One chat turn of the timeline planner. The AI model (DeepInfra, OpenAI-
// compatible API) either asks one short question or picks Playbook steps, a
// date and a size. Its answer is checked; on no key, an error, a timeout or a
// bad answer the keyword rules in timeline-plan.ts take over, so a turn never
// fails.
import type { TimelineChatTurn } from "@/lib/db/schema";
import {
  SIZES,
  guessSize,
  guessTitle,
  isIsoDate,
  parseDate,
  ruleStepIds,
  type EventSize,
  type PlanStep,
} from "@/lib/timeline-plan";

export const DEEPINFRA_URL = "https://api.deepinfra.com/v1/openai/chat/completions";
export const DEFAULT_MODEL = "meta-llama/Llama-3.3-70B-Instruct-Turbo";
export const MAX_QUESTIONS = 2;
const TIMEOUT_MS = 20_000;

export type PlanDecision = { title: string; eventDate: string; size: EventSize; stepIds: string[] };
export type TurnResult =
  | { type: "question"; question: string; source: "ai" | "rules" }
  | ({ type: "timeline"; source: "ai" | "rules" } & PlanDecision);

type Fetch = typeof fetch;

export function systemPrompt(steps: PlanStep[], today: string, mustFinish: boolean): string {
  // Steps go by their number in this list, not their id: a uuid per step made
  // the reply long enough to run past the timeout.
  const lines = steps.map(
    (s, i) =>
      `${i + 1} | ${s.categoryName} | ${s.title}${s.whenNote ? ` | ${s.whenNote}` : ""}${s.formUrl ? " | has form" : ""}`
  );
  return [
    "You help student club board members at UC Santa Cruz plan an event. They are not technical.",
    `Today is ${today}.`,
    "From what they tell you, choose which Playbook steps they need. Steps (number | category | title | when it applies):",
    ...lines,
    "",
    "Reply with JSON only, in one of two shapes:",
    '{"type":"question","question":"<one short, friendly question>"}',
    '{"type":"timeline","title":"<short event name>","eventDate":"YYYY-MM-DD","size":"small|mid|large|major","steps":[<number>, ...]}',
    "Rules:",
    "- Ask a question only when the answer changes the plan: the date if none was given, or whether there is food, money, or how many people. Ask about one thing at a time.",
    "- size: small = up to 50 people, mid = up to 100, large = up to 250, major = more than 250 or open to the public.",
    "- Include every step that applies. Leave out steps whose 'when it applies' note doesn't fit (no food means no purchase order steps; no money means no funding steps).",
    "- Funding steps are only for money the org has to ask for (funding, a grant, a sponsor). Food alone is paid from the org's account and doesn't need them.",
    "- Every event with food gets the new vendor step; its note tells them when to skip it.",
    "- An event held off campus doesn't need the campus room steps.",
    "- The event date must be today or later. Use only step numbers from the list.",
    mustFinish ? "- You have asked enough. Reply with a timeline now, using your best guess for anything unknown." : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Checks the model's JSON; null when it can't be used. */
export function readReply(raw: string, steps: PlanStep[], today: string): TurnResult | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.type === "question") {
    const q = typeof d.question === "string" ? d.question.trim() : "";
    return q && q.length <= 300 ? { type: "question", question: q, source: "ai" } : null;
  }
  if (d.type !== "timeline") return null;
  const eventDate = typeof d.eventDate === "string" ? d.eventDate : "";
  if (!isIsoDate(eventDate) || eventDate < today) return null;
  const picked = Array.isArray(d.steps) ? d.steps : [];
  const stepIds = picked
    .map((n) => (typeof n === "number" || typeof n === "string" ? Number(n) : NaN))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= steps.length)
    .map((n) => steps[n - 1].id);
  if (stepIds.length === 0) return null;
  const size = SIZES.includes(d.size as EventSize) ? (d.size as EventSize) : "small";
  const title = typeof d.title === "string" && d.title.trim() ? d.title.trim().slice(0, 80) : "Event";
  return { type: "timeline", source: "ai", title, eventDate, size, stepIds: [...new Set(stepIds)] };
}

/** The keyword-rule answer for the whole conversation so far. */
export function ruleTurn(chat: TimelineChatTurn[], steps: PlanStep[], today: string): TurnResult {
  const said = chat.filter((t) => t.role === "user").map((t) => t.text);
  const all = said.join("\n");
  const asked = chat.filter((t) => t.role === "assistant").length;
  const date = parseDate(all, today);
  if (!date && asked < 1) {
    return { type: "question", source: "rules", question: "When is the event? A date like Nov 14 works." };
  }
  return {
    type: "timeline",
    source: "rules",
    title: guessTitle(said[0] ?? ""),
    eventDate: date ?? new Date(Date.parse(`${today}T00:00:00Z`) + 21 * 86_400_000).toISOString().slice(0, 10),
    size: guessSize(all),
    stepIds: ruleStepIds(all, steps),
  };
}

export async function planTurn(opts: {
  chat: TimelineChatTurn[];
  steps: PlanStep[];
  today: string;
  apiKey?: string;
  model?: string;
  fetchImpl?: Fetch;
  timeoutMs?: number;
}): Promise<TurnResult> {
  const { chat, steps, today } = opts;
  const asked = chat.filter((t) => t.role === "assistant").length;
  const mustFinish = asked >= MAX_QUESTIONS;
  // The rules ask at most once (for the date), so they always finish.
  const fallback = () => ruleTurn(chat, steps, today);
  if (!opts.apiKey) return fallback();
  try {
    const res = await (opts.fetchImpl ?? fetch)(DEEPINFRA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify({
        model: opts.model || DEFAULT_MODEL,
        temperature: 0,
        max_tokens: 500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt(steps, today, mustFinish) },
          ...chat.map((t) => ({ role: t.role, content: t.text })),
        ],
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return fallback();
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const reply = readReply(json.choices?.[0]?.message?.content ?? "", steps, today);
    if (!reply || (mustFinish && reply.type === "question")) return fallback();
    // The model sometimes skips the date question and dates the event today,
    // which makes every step late. With no date said yet, ask for it first.
    const said = chat.filter((t) => t.role === "user").map((t) => t.text).join("\n");
    if (reply.type === "timeline" && asked < 1 && !parseDate(said, today)) return fallback();
    return reply;
  } catch {
    return fallback();
  }
}
