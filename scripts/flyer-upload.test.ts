// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { imagesClient, prepareImage, runImageSync, syncEventImages, type ImageState, type Prepared, type PutImages } from "./flyer-upload";

describe("prepareImage", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "flyer-upload-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("strips metadata, applies the orientation and fits within 2000 px", async () => {
    const file = join(dir, "phone.jpg");
    await sharp({ create: { width: 3000, height: 1000, channels: 3, background: "red" } })
      .withMetadata({ orientation: 6 })
      .withExif({ IFD0: { Copyright: "someone's phone" } })
      .jpeg()
      .toFile(file);
    expect((await sharp(file).metadata()).exif).toBeDefined();
    const p = await prepareImage(file);
    const meta = await sharp(p.bytes).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect([meta.width, meta.height]).toEqual([667, 2000]); // upright, then fitted
    expect(p.id).toMatch(/^[0-9a-f]{16}$/);
    expect((await prepareImage(file)).id).toBe(p.id); // stable across runs
  });
});

const fakePrepare = async (file: string): Promise<Prepared> => ({ file, id: `${file.replace(/\W/g, "").padEnd(16, "0")}`.slice(0, 16), bytes: Buffer.alloc(2048) });

function fakeApi(opts: { probe?: { httpStatus: number; json: Record<string, unknown> }; put?: (body: Record<string, unknown>) => { httpStatus: number; json: Record<string, unknown> } } = {}) {
  const calls: Record<string, unknown>[] = [];
  const put: PutImages = async (body) => {
    calls.push(body);
    if (body.dryRun) return opts.probe ?? { httpStatus: 200, json: { ok: true, status: "unchanged", eventId: "EV1", images: [] } };
    if (opts.put) return opts.put(body);
    const images = (body.images as { url?: string; id?: string }[]).map((i) => ({ id: i.id ?? i.url!.split("/").pop()!.replace(".jpg", "") }));
    return { httpStatus: 200, json: { ok: true, status: "updated", eventId: "EV1", images } };
  };
  const uploads: string[] = [];
  const upload = async (path: string) => {
    uploads.push(path);
    return `https://store.public.blob.vercel-storage.com/${path}`;
  };
  return { put, upload, calls, uploads };
}

describe("syncEventImages", () => {
  it("finds the event, uploads each image under flyers/<eventId>/, sends the ordered list and records it", async () => {
    const api = fakeApi();
    const state: ImageState = {};
    const r = await syncEventImages("wa:1", ["/f/a.jpg", "/f/b.jpg"], state, { put: api.put, upload: api.upload, prepare: fakePrepare, dryRun: false, titles: { "wa:1": "Potluck" } });
    expect(r.status).toBe("attached");
    expect(api.uploads).toEqual(["flyers/EV1/fajpg00000000000.jpg", "flyers/EV1/fbjpg00000000000.jpg"]);
    expect(api.calls[0]).toEqual({ source: "whatsapp", sourceId: "wa:1", images: [], dryRun: true });
    expect(api.calls[1].images).toEqual([
      { url: "https://store.public.blob.vercel-storage.com/flyers/EV1/fajpg00000000000.jpg", alt: "Potluck flyer (1 of 2)" },
      { url: "https://store.public.blob.vercel-storage.com/flyers/EV1/fbjpg00000000000.jpg", alt: "Potluck flyer (2 of 2)" },
    ]);
    expect(state["wa:1"]).toEqual({ eventId: "EV1", ids: ["fajpg00000000000", "fbjpg00000000000"], sent: ["fajpg00000000000", "fbjpg00000000000"] });

    // A re-run sends nothing; a new third flyer uploads only itself.
    const again = fakeApi();
    expect((await syncEventImages("wa:1", ["/f/a.jpg", "/f/b.jpg"], state, { put: again.put, upload: again.upload, prepare: fakePrepare, dryRun: false })).status).toBe("unchanged");
    expect(again.calls).toEqual([]);
    const more = fakeApi();
    await syncEventImages("wa:1", ["/f/a.jpg", "/f/b.jpg", "/f/c.jpg"], state, { put: more.put, upload: more.upload, prepare: fakePrepare, dryRun: false });
    expect(more.uploads).toEqual(["flyers/EV1/fcjpg00000000000.jpg"]);
    expect((more.calls[0].images as Record<string, string>[]).map((i) => i.id ?? "url")).toEqual(["fajpg00000000000", "fbjpg00000000000", "url"]);
  });

  it("keeps the same picture once", async () => {
    const api = fakeApi();
    await syncEventImages("wa:2", ["/f/a.jpg", "/f/a.jpg"], {}, { put: api.put, upload: api.upload, prepare: fakePrepare, dryRun: false });
    expect(api.uploads).toHaveLength(1);
  });

  it("on a dry run, lists what would go where and uploads nothing", async () => {
    const api = fakeApi();
    const state: ImageState = {};
    const r = await syncEventImages("wa:3", ["/f/a.jpg"], state, { put: api.put, upload: null, prepare: fakePrepare, dryRun: true });
    expect(r.status).toBe("would-attach");
    expect(r.lines).toEqual(["a.jpg -> flyers/EV1/fajpg00000000000.jpg (2 KB)"]);
    expect(api.calls).toHaveLength(1); // only the probe
    expect(state).toEqual({});
  });

  it("reports a missing event and an admin conflict without retrying", async () => {
    const missing = fakeApi({ probe: { httpStatus: 200, json: { ok: true, status: "not_found" } } });
    expect((await syncEventImages("wa:4", ["/f/a.jpg"], {}, { put: missing.put, upload: missing.upload, prepare: fakePrepare, dryRun: false })).status).toBe("not_found");
    expect(missing.uploads).toEqual([]);
    const admin = fakeApi({ put: () => ({ httpStatus: 200, json: { ok: true, status: "conflict", reason: "edited_by_admin", eventId: "EV1" } }) });
    const r = await syncEventImages("wa:5", ["/f/a.jpg"], {}, { put: admin.put, upload: admin.upload, prepare: fakePrepare, dryRun: false });
    expect([r.status, r.note]).toEqual(["conflict", "edited_by_admin"]);
  });
});

describe("runImageSync", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "flyer-upload-state-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("stops at once when the image endpoint isn't deployed", async () => {
    const api = fakeApi({ probe: { httpStatus: 404, json: {} } });
    const s = await runImageSync([{ sourceId: "wa:1", files: ["/f/a.jpg"] }, { sourceId: "wa:2", files: ["/f/b.jpg"] }], {
      dryRun: false,
      put: api.put,
      upload: api.upload,
      prepare: fakePrepare,
      statePath: join(dir, "state.json"),
    });
    expect(s.notLive).toMatch(/404/);
    expect(api.calls).toHaveLength(1);
    expect(api.uploads).toEqual([]);
  });

  it("on a dry run before the endpoint is live, plans offline after the first 404", async () => {
    const api = fakeApi({ probe: { httpStatus: 404, json: {} } });
    const s = await runImageSync([{ sourceId: "wa:1", files: ["/f/a.jpg"] }, { sourceId: "wa:2", files: ["/f/b.jpg"] }], { dryRun: true, put: api.put, upload: null, prepare: fakePrepare, statePath: join(dir, "state.json") });
    expect(s.notLive).toMatch(/404/);
    expect(s.outcomes.map((o) => [o.status, o.lines[0]])).toEqual([
      ["would-attach", "a.jpg -> flyers/<eventId>/fajpg00000000000.jpg (2 KB)"],
      ["would-attach", "b.jpg -> flyers/<eventId>/fbjpg00000000000.jpg (2 KB)"],
    ]);
    expect(api.calls).toHaveLength(1);
  });

  it("saves state after an attached event, but not on a dry run", async () => {
    const statePath = join(dir, "state.json");
    const api = fakeApi();
    await runImageSync([{ sourceId: "wa:1", files: ["/f/a.jpg"] }], { dryRun: true, put: api.put, upload: null, prepare: fakePrepare, statePath });
    expect(existsSync(statePath)).toBe(false);
    await runImageSync([{ sourceId: "wa:1", files: ["/f/a.jpg"] }], { dryRun: false, put: api.put, upload: api.upload, prepare: fakePrepare, statePath });
    expect(JSON.parse(readFileSync(statePath, "utf8"))["wa:1"].eventId).toBe("EV1");
  });
});

describe("imagesClient", () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("paces requests and waits out a 429", async () => {
    const sleeps: number[] = [];
    let n = 0;
    globalThis.fetch = (async (_u: string | URL | Request, init?: RequestInit) => {
      n++;
      expect((init?.headers as Record<string, string>).authorization).toBe(`Bearer ${"t".repeat(40)}`);
      return n === 1 ? new Response("{}", { status: 429, headers: { "retry-after": "5" } }) : new Response(JSON.stringify({ ok: true, status: "unchanged" }), { status: 200 });
    }) as typeof fetch;
    const put = imagesClient({ baseUrl: "https://ucscmsa.com", token: "t".repeat(40), minGapMs: 1000, sleep: async (ms) => void sleeps.push(ms) });
    const r = await put({ source: "whatsapp", sourceId: "wa:1", images: [] });
    expect(r.json.status).toBe("unchanged");
    expect(sleeps[0]).toBe(5000);
    expect(n).toBe(2);
  });

  it("refuses plain http to a remote host", () => {
    expect(() => imagesClient({ baseUrl: "http://ucscmsa.com", token: "t" })).toThrow(/Refusing/);
  });
});
