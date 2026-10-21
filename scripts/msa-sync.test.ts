// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CallModel, SourceItem } from "./eventify";
import { eventifyItems, loadSyncConfig, loadSyncState, saveSyncState, yagamiCall, yagamiUp, type SyncState, type SyncSummary } from "./msa-sync";

const item = (sourceId: string, text: string): SourceItem => ({ sourceId, sourceRef: "ref", sentDate: "2026-02-01", text });

function mockCall(byText: (text: string) => unknown): CallModel {
  return async (req) => JSON.stringify(byText(req.text));
}

const emptySummary = (): SyncSummary => ({ waRead: 0, flyersMatched: 0, flyersUnmatched: 0, candidates: 0, created: [], updated: [], unchanged: [], needsReview: [], skipped: [], errors: [], enrichment: [] });
const emptyState = (): SyncState => ({ version: 1, lastWaUnix: null, processed: {} });

describe("eventifyItems", () => {
  it("turns a clean event into an upsert and marks it created", async () => {
    const summary = emptySummary();
    const state = emptyState();
    const ops = await eventifyItems([item("wa:1", "Potluck on Friday")], state, {
      call: mockCall(() => ({ isEvent: true, title: "Potluck", date: { value: "2026-02-06" }, confidence: 0.9 })),
      primaryModel: "haiku",
      verifierModel: "sonnet",
      summary,
    });
    expect(ops).toHaveLength(1);
    expect(summary.created).toEqual(["wa:1"]);
    expect(state.processed["wa:1"].status).toBe("posted");
  });

  it("sends a low-confidence item to review, not to the batch", async () => {
    const summary = emptySummary();
    const state = emptyState();
    const ops = await eventifyItems([item("wa:2", "maybe something")], state, {
      call: mockCall(() => ({ isEvent: true, title: "?", date: { value: "2026-02-06" }, confidence: 0.2 })),
      primaryModel: "haiku",
      verifierModel: "sonnet",
      summary,
    });
    expect(ops).toHaveLength(0);
    expect(summary.needsReview.map((r) => r.sourceId)).toEqual(["wa:2"]);
    expect(state.processed["wa:2"].status).toBe("needs-review");
  });

  it("records a skip for a non-event", async () => {
    const summary = emptySummary();
    const state = emptyState();
    const ops = await eventifyItems([item("wa:3", "fill the form")], state, {
      call: mockCall(() => ({ isEvent: false, skipReason: "a form", confidence: 0.9 })),
      primaryModel: "haiku",
      verifierModel: "sonnet",
      summary,
    });
    expect(ops).toHaveLength(0);
    expect(summary.skipped).toEqual([{ sourceId: "wa:3", reason: "a form" }]);
  });

  it("counts an already-posted item as updated when it changes", async () => {
    const summary = emptySummary();
    const state: SyncState = { version: 1, lastWaUnix: null, processed: { "wa:4": { hash: "old", status: "posted" } } };
    await eventifyItems([item("wa:4", "Potluck moved to Saturday")], state, {
      call: mockCall(() => ({ isEvent: true, title: "Potluck", date: { value: "2026-02-07" }, confidence: 0.9 })),
      primaryModel: "haiku",
      verifierModel: "sonnet",
      summary,
    });
    expect(summary.updated).toEqual(["wa:4"]);
    expect(summary.created).toEqual([]);
  });

  it("isolates a failing item and keeps going", async () => {
    const summary = emptySummary();
    const state = emptyState();
    const call: CallModel = async (req) => {
      if (req.text.includes("boom")) throw new Error("model exploded");
      return JSON.stringify({ isEvent: true, title: "OK", date: { value: "2026-02-06" }, confidence: 0.9 });
    };
    const ops = await eventifyItems([item("wa:5", "boom"), item("wa:6", "fine")], state, { call, primaryModel: "haiku", verifierModel: "sonnet", summary });
    expect(ops).toHaveLength(1);
    expect(summary.errors.join(" ")).toMatch(/wa:5: model exploded/);
    expect(summary.created).toEqual(["wa:6"]);
  });
});

describe("yagamiCall", () => {
  const noSleep = () => Promise.resolve();
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("POSTs an image + text message with effort, returns the joined text", async () => {
    let captured: { url: string; body: Record<string, unknown> } | null = null;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      captured = { url: String(url), body: JSON.parse(String(init?.body)) };
      return new Response(JSON.stringify({ content: [{ type: "text", text: '{"isEvent":false}' }] }), { status: 200 });
    }) as typeof fetch;
    const call = yagamiCall({ baseUrl: "http://127.0.0.1:8787", apiKey: "ygm_test_key_1234567890", sleep: noSleep });
    const out = await call({ model: "claude-haiku-5-5", system: "sys", text: "hello", imageBase64: "AAAA", imageMediaType: "image/jpeg" });
    expect(out).toBe('{"isEvent":false}');
    expect(captured!.url).toBe("http://127.0.0.1:8787/v1/messages");
    expect(captured!.body.model).toBe("claude-haiku-5-5");
    expect(captured!.body.effort).toBe("medium");
    const content = (captured!.body.messages as { content: { type: string }[] }[])[0].content;
    expect(content[0].type).toBe("image");
    expect(content[1].type).toBe("text");
  });

  it("retries a 529 then succeeds", async () => {
    let n = 0;
    globalThis.fetch = (async () => {
      n++;
      return n < 3 ? new Response("busy", { status: 529 }) : new Response(JSON.stringify({ content: [{ type: "text", text: "{}" }] }), { status: 200 });
    }) as typeof fetch;
    const call = yagamiCall({ baseUrl: "http://127.0.0.1:8787", apiKey: "k".repeat(32), sleep: noSleep });
    expect(await call({ model: "m", system: "s", text: "t" })).toBe("{}");
    expect(n).toBe(3);
  });

  it("treats an HTTP-200 overload reply as a failure and retries", async () => {
    let n = 0;
    globalThis.fetch = (async () => {
      n++;
      const text = n < 2 ? "API Error: 529 Overloaded" : '{"isEvent":false}';
      return new Response(JSON.stringify({ content: [{ type: "text", text }] }), { status: 200 });
    }) as typeof fetch;
    const call = yagamiCall({ baseUrl: "http://127.0.0.1:8787", apiKey: "k".repeat(32), sleep: noSleep });
    expect(await call({ model: "m", system: "s", text: "t" })).toBe('{"isEvent":false}');
    expect(n).toBe(2);
  });

  it("does not retry an auth error", async () => {
    let n = 0;
    globalThis.fetch = (async () => {
      n++;
      return new Response("bad key", { status: 401 });
    }) as typeof fetch;
    const call = yagamiCall({ baseUrl: "http://127.0.0.1:8787", apiKey: "k".repeat(32), sleep: noSleep });
    await expect(call({ model: "m", system: "s", text: "t" })).rejects.toThrow(/401/);
    expect(n).toBe(1);
  });

  it("never retries a refused connection", async () => {
    let n = 0;
    globalThis.fetch = (async () => {
      n++;
      throw new TypeError("fetch failed", { cause: new Error("ECONNREFUSED 127.0.0.1:8787") });
    }) as typeof fetch;
    const call = yagamiCall({ baseUrl: "http://127.0.0.1:8787", apiKey: "k".repeat(32), sleep: noSleep });
    await expect(call({ model: "m", system: "s", text: "t" })).rejects.toThrow(/unreachable|running/);
    expect(n).toBe(1);
  });
});

describe("yagamiUp", () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });
  it("is up when the port answers (even with 401)", async () => {
    globalThis.fetch = (async () => new Response("no", { status: 401 })) as typeof fetch;
    expect(await yagamiUp("http://127.0.0.1:8787")).toBe(true);
  });
  it("is down when the connection is refused", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    expect(await yagamiUp("http://127.0.0.1:8787")).toBe(false);
  });
});

describe("sync config and state", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "msa-cfg-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("fills in the default model ids when the config is absent", () => {
    const cfg = loadSyncConfig(join(dir, "missing.json"));
    expect(cfg.aiModel).toBe("claude-haiku-5-5");
    expect(cfg.aiVerifierModel).toBe("claude-sonnet-5-5");
    expect(cfg.flyerDir).toBeUndefined();
  });

  it("round-trips state through save and load", () => {
    const p = join(dir, "state.json");
    const state: SyncState = { version: 1, lastWaUnix: 123, processed: { "wa:1": { hash: "h", status: "posted" } } };
    saveSyncState(p, state);
    expect(loadSyncState(p)).toEqual(state);
  });
});
