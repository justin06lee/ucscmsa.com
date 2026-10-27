import { describe, expect, it, vi } from "vitest";
import { PLAYBOOK_SEED } from "./playbook-content";
import {
  PROPOSAL_LEAD,
  buildItems,
  daysBetween,
  guessSize,
  isProposalStep,
  parseDate,
  redateItems,
  ruleStepIds,
  type PlanStep,
} from "./timeline-plan";
import { BUILD_NOW, DATE_QUESTION, MAX_QUESTIONS, planTurn, readReply } from "./timeline-llm";
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
  it("puts the Event Proposal first, once, filed with the room request three weeks out", () => {
    const ids = steps
      .filter((s) => !["after-the-event", "get-funding"].includes(s.categorySlug))
      .map((s) => s.id);
    const items = buildItems(steps, ids, "2026-11-20", "small", today);
    expect(isProposalStep(items[0])).toBe(true);
    expect(items.filter(isProposalStep)).toHaveLength(1);
    expect(items[0].due).toBe("2026-10-30");
    for (const it of items) expect(it.due <= "2026-11-20").toBe(true);
  });

  it("files the proposal five weeks out when the event needs funding", () => {
    const ids = steps.filter((s) => s.categorySlug === "get-funding").map((s) => s.id);
    const items = buildItems(steps, ids, "2026-12-18", "small", today);
    expect(items.filter(isProposalStep)).toHaveLength(1);
    expect(items[0].due).toBe("2026-11-13");
  });

  it("plans a food halaqa: room confirmed before any promotion, under a month in all", () => {
    const text = "Halaqa on Nov 19 with pizza, about 30 people";
    const items = buildItems(steps, ruleStepIds(text, steps), "2026-11-19", guessSize(text), today);
    const due = (title: string) => items.find((i) => i.title === title)?.due ?? "missing";
    expect(isProposalStep(items[0])).toBe(true);
    expect(items[0].due).toBe("2026-10-29");
    expect(due("Send the booking request")).toBe("2026-10-29");
    const confirmed = due("Wait for the confirmation email");
    const at = (title: string) => items.findIndex((i) => i.title === title);
    expect(confirmed).toBe("2026-11-05");
    for (const t of ["Make the flyer", "Post it", "Send a reminder"]) {
      expect(due(t) >= confirmed).toBe(true);
      expect(at(t)).toBeGreaterThan(at("Wait for the confirmation email"));
    }
    expect(due("Get a food permit")).toBe("2026-11-05");
    expect(due("New vendor? Get the 204 payee setup")).toBe("2026-10-29");
    expect(due("Send the Purchase Request")).toBe("2026-11-12");
    expect(items.some((i) => i.category === "Get funding")).toBe(false);
    const dated = items.filter((i) => i.leadDays > 0).map((i) => i.due).sort();
    expect(daysBetween(dated[0], "2026-11-19")).toBeLessThan(30);
  });

  it("moves the proposal up with the room request even when only the room steps are picked", () => {
    const room = steps.filter((s) => s.categorySlug === "reserve-a-room" && !isProposalStep(s)).map((s) => s.id);
    const items = buildItems(steps, room, "2026-12-03", "small", today);
    expect(isProposalStep(items[0])).toBe(true);
    expect(items[0].leadDays).toBe(21);
    expect(items.filter(isProposalStep)).toHaveLength(1);
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

  const titles = (text: string) => {
    const ids = new Set(ruleStepIds(text, steps));
    return steps.filter((s) => ids.has(s.id)).map((s) => s.title);
  };

  it("keeps the room for an outside speaker and adds the speaker paperwork", () => {
    const t = titles("bringing an outside speaker, ticketed, in a big hall");
    expect(t).toContain("Send the booking request");
    expect(t).toContain("Paying a speaker or performer? Start the paperwork");
    expect(t).toContain("Send the speaker or performer's Purchase Request");
    expect(t).not.toContain("Ask for a tent or AV equipment");
  });

  it("treats a bake sale as food and a fundraiser, not a funding request", () => {
    const t = titles("bake sale fundraiser on campus");
    expect(t).toContain("Get a food permit");
    expect(t).toContain("Fundraiser? Meet an advisor about it");
    expect(t.some((x) => x === "Pick where the money comes from")).toBe(false);
  });

  it("leaves food, speaker and fundraiser steps out of a plain halaqa", () => {
    const t = titles("halaqa thursday night in a classroom, ~15 people, no food, no money");
    for (const x of ["Paying a speaker or performer? Start the paperwork", "Fundraiser? Meet an advisor about it", "Pick where the money comes from"]) {
      expect(t).not.toContain(x);
    }
    expect(t).not.toContain("Get a food permit");
    expect(t).toContain("Make the flyer");
  });

  it("stretches the advisor meeting with the event's size", () => {
    const advisor = steps.find((s) => s.title === "Meet an advisor")!;
    const lead = (size: "small" | "mid" | "large" | "major") =>
      buildItems(steps, [advisor.id], "2027-03-01", size, today).find((i) => i.stepId === advisor.id)?.leadDays;
    expect([lead("small"), lead("mid"), lead("large"), lead("major")]).toEqual([7, 14, 42, 56]);
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

  it("asks for the date first, before calling the model, when nobody gave one", async () => {
    const fetchImpl = reply(JSON.stringify({ type: "timeline", title: "Halaqa", eventDate: today, size: "small", steps: [1] }));
    const r = await planTurn({ chat: [{ role: "user", text: "a halaqa with pizza" }], steps, today, apiKey: "k", fetchImpl });
    expect(r).toEqual({ type: "question", question: DATE_QUESTION, source: "ai" });
    expect(fetchImpl).not.toHaveBeenCalled();
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

  it("tells the model to build now on the last turn, and retries once if it still asks", async () => {
    const long = [...chat, { role: "assistant" as const, text: "Public?" }, { role: "user" as const, text: "no" }, { role: "assistant" as const, text: "Food?" }, { role: "user" as const, text: "yes" }];
    const answers = ['{"type":"question","question":"Anything else?"}', JSON.stringify({ type: "timeline", title: "Halaqa", eventDate: "2026-11-20", size: "small", steps: [1] })];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const sent = JSON.parse(String(init?.body)).messages;
      expect(sent.at(-1)).toEqual({ role: "user", content: BUILD_NOW });
      return new Response(JSON.stringify({ choices: [{ message: { content: answers.shift() } }] }));
    });
    const r = await planTurn({ chat: long, steps, today, apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r).toMatchObject({ type: "timeline", source: "ai" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
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
