import { createHash } from "node:crypto";
import { z } from "zod";
import { isRealYmd } from "./event-rules";
import { PLAN_TAGS, PLAN_TAG_IDS, templatesFor } from "./planning";
import type { AgentSelection, PlanningAgent } from "./playbook";

export const DEEPINFRA_URL = "https://api.deepinfra.com/v1/openai/chat/completions";
// $0.02/M input, $0.04/M output tokens on DeepInfra (checked 2026-10-26).
export const DEEPINFRA_DEFAULT_MODEL = "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo";
const MAX_TOKENS = 300;
const TIMEOUT_MS = 8000;
const CACHE_LIMIT = 200;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const AI_NOTE =
  "Suggested by an AI model from your description. Review the date and steps before you create the event.";
const OFFCAMPUS_NOTE =
  "The guide says there are no official off-campus events. Confirm the plan with your advisor.";
const NO_DATE_NOTE = "Choose an event date to see the dated timeline.";

// Untrusted model output: anything outside this shape sends the request to the fallback.
const modelReplySchema = z.object({
  title: z.string().trim().min(1).max(200),
  eventYmd: z.string().nullable(),
  tags: z.array(z.enum(PLAN_TAG_IDS)).max(PLAN_TAG_IDS.length),
  notes: z.array(z.string().trim().min(1).max(300)).max(3).default([]),
});

function systemPrompt(todayYmd: string) {
  const tags = PLAN_TAGS.map((t) => `"${t.id}" (${t.label})`).join(", ");
  return [
    "You help student officers of the UCSC Muslim Student Association plan an event.",
    `Today is ${todayYmd}. Read the event description and reply with one JSON object only:`,
    '{"title": string, "eventYmd": "YYYY-MM-DD" or null, "tags": string[], "notes": string[]}',
    "- title: a short event name taken from the description.",
    "- eventYmd: the event date if the description gives one; pick the next such date on or after today when no year is given; null if no date is given. Never guess a date.",
    `- tags: only from ${tags}. "room" means it needs a campus room, "food" means food is served, "funding" means it needs money, "big" means a large or public event (over 100 people), "offcampus" means it is off campus, "collab" means another group co-hosts. Leave a tag out when the description says it is not needed.`,
    "- notes: at most 3 short notes about things the description leaves unclear. No advice that isn't about this event.",
  ].join("\n");
}

type Entry = { at: number; value: AgentSelection };

export function createDeepInfraPlanningAgent(opts: {
  apiKey: string;
  fallback: PlanningAgent;
  model?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
}): PlanningAgent {
  const model = opts.model || DEEPINFRA_DEFAULT_MODEL;
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const cache = new Map<string, Entry>();

  async function ask(description: string, todayYmd: string) {
    const res = await doFetch(DEEPINFRA_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: MAX_TOKENS,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt(todayYmd) },
          { role: "user", content: description },
        ],
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`DeepInfra ${res.status}`);
    const body = (await res.json()) as {
      choices?: { message?: { content?: unknown } }[];
    };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("DeepInfra: no content");
    return modelReplySchema.parse(JSON.parse(content));
  }

  return {
    async propose(input) {
      const { description, todayYmd, cards } = input;
      // Card revisions are in the key, so an edited board never reuses an old plan.
      const key = createHash("sha256")
        .update(JSON.stringify([model, todayYmd, description, cards.map((c) => [c.id, c.revision])]))
        .digest("hex");
      const hit = cache.get(key);
      if (hit && now() - hit.at < CACHE_TTL_MS) return hit.value;
      let reply;
      try {
        reply = await ask(description, todayYmd);
      } catch {
        return opts.fallback.propose(input);
      }
      const tags = [...new Set(reply.tags)];
      const eventYmd =
        reply.eventYmd && isRealYmd(reply.eventYmd) && reply.eventYmd >= todayYmd
          ? reply.eventYmd
          : null;
      const notes = [AI_NOTE, ...reply.notes];
      if (tags.includes("offcampus")) notes.push(OFFCAMPUS_NOTE);
      if (!eventYmd) notes.push(NO_DATE_NOTE);
      const value: AgentSelection = {
        title: reply.title,
        eventYmd,
        tags,
        cardIds: templatesFor(tags, cards).map((c) => c.id),
        notes,
      };
      if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
      cache.set(key, { at: now(), value });
      return value;
    },
  };
}
