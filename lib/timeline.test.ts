import { describe, expect, it, vi } from "vitest";
import { PLAYBOOK_SEED } from "./playbook-content";
import {
  PROPOSAL_LEAD,
  buildItems,
  guessSize,
  isProposalStep,
  parseDate,
  redateItems,
  ruleStepIds,
  type PlanStep,
} from "./timeline-plan";
import { MAX_QUESTIONS, planTurn, readReply } from "./timeline-llm";
import { textBlocks, timingLabel } from "@/components/playbook/step-text";

const steps: PlanStep[] = PLAYBOOK_SEED.flatMap((c, ci) =>
  c.steps.map((s, si) => ({
    id: `${c.slug}-${si + 1}`,
    categorySlug: c.slug,
    categoryName: c.name,
    categorySort: ci + 1,
    sort: si + 1,
    title: s.title,
    body: s.body,
    whenNote: s.whenNote ?? "",
    leadDays: s.leadDays,
    formLabel: s.formLabel ?? "",
    formUrl: s.formUrl ?? "",
  })),
);
const today = "2026-10-26";
const reply = (content: string) =>
  vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }));

describe("the playbook content", () => {
  it("has six general categories, each with steps", () => {
    expect(PLAYBOOK_SEED.map((c) => c.slug)).toEqual([
      "event-proposal",
      "reserve-a-room",
      "get-funding",
      "purchase-orders",
      "promote",
      "after-the-event",
    ]);
    for (const c of PLAYBOOK_SEED) expect(c.steps.length).toBeGreaterThan(0);
  });

  it("never asks for more than eight weeks of lead time", () => {
    for (const s of steps) expect(s.leadDays ?? 0).toBeLessThanOrEqual(56);
    expect(Math.max(...Object.values(PROPOSAL_LEAD))).toBeLessThanOrEqual(56);
    expect(PROPOSAL_LEAD.small).toBeLessThanOrEqual(7);
  });

  it("links every form over https", () => {
    for (const s of steps) if (s.formUrl) expect(s.formUrl).toMatch(/^https:\/\//);
  });
});

describe("buildItems", () => {
  it("puts the Event Proposal first, once, and dates steps back from the event", () => {
    const ids = steps
      .filter((s) => !["after-the-event", "get-funding"].includes(s.categorySlug))
      .map((s) => s.id);
    const items = buildItems(steps, ids, "2026-11-20", "small", today);
    expect(isProposalStep(items[0])).toBe(true);
    expect(items.filter(isProposalStep)).toHaveLength(1);
    expect(items[0].due).toBe("2026-11-13");
    for (const it of items) expect(it.due <= "2026-11-20").toBe(true);
  });

  it("files the proposal three weeks out when the event needs funding", () => {
    const ids = steps.filter((s) => s.categorySlug === "get-funding").map((s) => s.id);
    const items = buildItems(steps, ids, "2026-11-20", "small", today);
    expect(items.filter(isProposalStep)).toHaveLength(1);
    expect(items[0].due).toBe("2026-10-30");
  });

  it("adds the proposal even when not picked, and never dates a step before today", () => {
    const items = buildItems(steps, [], "2026-10-29", "large", today);
    expect(items).toHaveLength(1);
    expect(items[0].due).toBe(today);
  });

  it("re-dates when the event moves, keeping what is done", () => {
    const items = buildItems(steps, [steps[0].id], "2026-11-20", "small", today).map((i) => ({ ...i, done: true }));
    const moved = redateItems(items, "2026-12-04", today);
    expect(moved[0].due).toBe("2026-11-27");
    expect(moved[0].done).toBe(true);
  });
});

describe("keyword rules", () => {
  it("reads dates and sizes", () => {
    expect(parseDate("halaqa on Nov 20", today)).toBe("2026-11-20");
    expect(guessSize("a small halaqa for 15")).toBe("small");
    expect(guessSize("public fundraiser dinner for 300 people with a speaker")).not.toBe("small");
  });

  it("picks food steps only when there is food", () => {
    const withFood = ruleStepIds("halaqa with pizza", steps);
    const without = ruleStepIds("study circle in the library", steps);
    expect(withFood.length).toBeGreaterThan(without.length);
  });
});

describe("planTurn", () => {
  const chat = [{ role: "user" as const, text: "Halaqa with pizza for 30 on Nov 20 in a classroom" }];

  it("uses the rules without a key", async () => {
    const r = await planTurn({ chat, steps, today });
    expect(r).toMatchObject({ type: "timeline", source: "rules", eventDate: "2026-11-20" });
  });

  it("asks for the date by rules when none is given", async () => {
    const r = await planTurn({ chat: [{ role: "user", text: "a halaqa" }], steps, today });
    expect(r).toMatchObject({ type: "question", source: "rules" });
  });

  it("takes a valid model timeline", async () => {
    const fetchImpl = reply(
      JSON.stringify({ type: "timeline", title: "Pizza halaqa", eventDate: "2026-11-20", size: "small", steps: [1, 999, "x"] }),
    );
    const r = await planTurn({ chat, steps, today, apiKey: "k", fetchImpl });
    expect(r).toEqual({ type: "timeline", source: "ai", title: "Pizza halaqa", eventDate: "2026-11-20", size: "small", stepIds: [steps[0].id] });
  });

  it("passes a model question through", async () => {
    const r = await planTurn({ chat, steps, today, apiKey: "k", fetchImpl: reply('{"type":"question","question":"Is it open to the public?"}') });
    expect(r).toEqual({ type: "question", question: "Is it open to the public?", source: "ai" });
  });

  it("falls back on a server error, a timeout, or bad JSON", async () => {
    const err = vi.fn(async () => new Response("no", { status: 500 }));
    const timeout = vi.fn(async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    for (const fetchImpl of [err, timeout, reply("not json"), reply('{"type":"timeline","eventDate":"2020-01-01","steps":[1]}')]) {
      const r = await planTurn({ chat, steps, today, apiKey: "k", fetchImpl });
      expect(r.source).toBe("rules");
    }
  });

  it("stops asking after the question limit", async () => {
    const long = [
      ...chat,
      { role: "assistant" as const, text: "Public?" },
      { role: "user" as const, text: "no" },
      { role: "assistant" as const, text: "Food?" },
      { role: "user" as const, text: "yes" },
    ];
    expect(long.filter((t) => t.role === "assistant")).toHaveLength(MAX_QUESTIONS);
    const r = await planTurn({ chat: long, steps, today, apiKey: "k", fetchImpl: reply('{"type":"question","question":"Anything else?"}') });
    expect(r.type).toBe("timeline");
  });

  it("rejects replies that are not questions or timelines", () => {
    expect(readReply('{"type":"poem"}', steps, today)).toBeNull();
    expect(readReply('{"type":"timeline","eventDate":"2026-11-20","steps":[]}', steps, today)).toBeNull();
  });
});

describe("step text", () => {
  it("labels timing plainly", () => {
    expect(timingLabel(null)).toBeNull();
    expect(timingLabel(0)).toBe("On the day");
    expect(timingLabel(7)).toBe("1 week before");
    expect(timingLabel(5)).toBe("5 days before");
    expect(timingLabel(-14)).toBe("2 weeks after");
  });

  it("turns dash lines into a list and blank lines into paragraphs", () => {
    expect(textBlocks("Do this.\n\n- one\n- two\nThen that.")).toEqual([
      { kind: "p", lines: ["Do this."] },
      { kind: "ul", items: ["one", "two"] },
      { kind: "p", lines: ["Then that."] },
    ]);
  });
});
