import { describe, expect, it, vi } from "vitest";
import { createDeepInfraPlanningAgent, DEEPINFRA_URL } from "./deepinfra-planner";
import { getPlanningAgent, localPlanningAgent } from "./planning-agent";
import type { PlanningAgent, PlaybookCard } from "./playbook";

const card = (id: string, tag: PlaybookCard["tag"], revision = 1) =>
  ({ id, title: id, body: "", daysBefore: 7, tag, dependencies: [], sort: 0, guideSlug: null, revision }) as unknown as PlaybookCard;
const cards = [card("proposal", null), card("room", "room"), card("food", "food"), card("big", "big")];
const input = { description: "Fall iftar dinner in the Stevenson event center, Nov 14", todayYmd: "2026-10-26", cards };

const fallback: PlanningAgent = {
  propose: vi.fn(async () => ({ title: "fallback", eventYmd: null, tags: [], cardIds: [], notes: ["keyword rules"] })),
};
const reply = (content: unknown, status = 200) =>
  new Response(JSON.stringify({ choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }] }), { status });
const good = { title: "Fall iftar", eventYmd: "2026-11-14", tags: ["room", "food"], notes: ["How many people?"] };
const agent = (fetch: typeof globalThis.fetch, timeoutMs?: number) =>
  createDeepInfraPlanningAgent({ apiKey: "test-key", fallback, fetch, timeoutMs });

describe("DeepInfra planning agent", () => {
  it("uses a valid reply and picks cards from its tags, never from the model", async () => {
    const fetch = vi.fn(async () => reply({ ...good, cardIds: ["made-up"] }));
    const r = await agent(fetch).propose(input);
    expect(r.title).toBe("Fall iftar");
    expect(r.eventYmd).toBe("2026-11-14");
    expect(r.tags).toEqual(["room", "food"]);
    expect(r.cardIds.sort()).toEqual(["food", "proposal", "room"]);
    expect(r.notes[0]).toMatch(/AI model/);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(DEEPINFRA_URL);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    const body = JSON.parse(init.body as string);
    expect(body.max_tokens).toBeLessThanOrEqual(600);
    expect(body.temperature).toBe(0);
  });

  it("caches a result, and asks again when the board changes", async () => {
    const fetch = vi.fn(async () => reply(good));
    const a = agent(fetch);
    await a.propose(input);
    await a.propose(input);
    expect(fetch).toHaveBeenCalledTimes(1);
    await a.propose({ ...input, cards: [...cards.slice(1), card("proposal", null, 2)] });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["an HTTP error", async () => reply(good, 500)],
    ["a network error", async () => { throw new TypeError("fetch failed"); }],
    ["text that isn't JSON", async () => reply("Sure! Here is your plan")],
    ["an unknown tag", async () => reply({ ...good, tags: ["room", "parking"] })],
    ["a missing title", async () => reply({ ...good, title: "" })],
  ])("falls back to the keyword rules on %s", async (_, impl) => {
    const r = await agent(vi.fn(impl)).propose(input);
    expect(r.title).toBe("fallback");
  });

  it("falls back when the call times out", async () => {
    const slow = vi.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason))));
    const r = await agent(slow as unknown as typeof fetch, 20).propose(input);
    expect(r.title).toBe("fallback");
  });

  it("drops a past or impossible date instead of keeping it", async () => {
    for (const eventYmd of ["2025-11-14", "2026-02-30"]) {
      const r = await agent(vi.fn(async () => reply({ ...good, eventYmd }))).propose(input);
      expect(r.eventYmd).toBeNull();
      expect(r.notes).toContain("Choose an event date to see the dated timeline.");
    }
  });
});

describe("getPlanningAgent", () => {
  it("uses the keyword rules when DEEPINFRA_API_KEY isn't set", () => {
    vi.stubEnv("DEEPINFRA_API_KEY", "");
    expect(getPlanningAgent()).toBe(localPlanningAgent);
    vi.stubEnv("DEEPINFRA_API_KEY", "k");
    expect(getPlanningAgent()).not.toBe(localPlanningAgent);
    vi.unstubAllEnvs();
  });
});
