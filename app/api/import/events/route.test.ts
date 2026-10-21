import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";

const h = vi.hoisted(() => ({ revalidatePath: vi.fn(), adminId: 0 }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("@/lib/auth", () => ({ requireAdminId: async () => h.adminId }));
vi.mock("@/lib/db/client", async () => {
  const { createTestDb } = await import("@/test/db");
  return { db: (await createTestDb()).db };
});

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  admins,
  eventCancellations,
  eventImportTombstones,
  events,
  rateLimits,
  users,
} from "@/lib/db/schema";
import { getOccurrencesInRange } from "@/lib/db/queries";
import { deleteEvent, updateEvent } from "@/app/admin/_actions";
import { POST } from "./route";

const TOKEN = "test-import-token-0123456789-abcdefghij";

type Body = { ok: boolean; dryRun?: boolean; error?: string; results?: Array<Record<string, unknown>>; issues?: Array<{ path: string }> };

async function post(
  body: unknown,
  opts: { token?: string | null; ip?: string; raw?: string; contentType?: string } = {}
): Promise<{ status: number; headers: Headers; json: Body }> {
  const headers: Record<string, string> = {
    "content-type": opts.contentType ?? "application/json",
    "x-forwarded-for": opts.ip ?? "203.0.113.7",
  };
  const token = opts.token === undefined ? TOKEN : opts.token;
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await POST(new Request("http://localhost/api/import/events", {
    method: "POST",
    headers,
    body: opts.raw ?? JSON.stringify(body),
  }));
  return { status: res.status, headers: res.headers, json: (await res.json()) as Body };
}

function upsert(sourceId: string, event: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  return {
    op: "upsert",
    sourceId,
    event: {
      title: "Jummah",
      location: "Stevenson Event Center",
      date: "2026-10-23",
      startTime: "13:30",
      endTime: "14:30",
      recurrence: { freq: "weekly", byWeekday: ["FR"] },
      ...event,
    },
    ...extra,
  };
}

const req = (...operations: unknown[]) => ({ source: "whatsapp", operations });

async function eventBySourceId(sourceId: string) {
  return (await db.select().from(events)
    .where(and(eq(events.source, "whatsapp"), eq(events.sourceId, sourceId))))[0];
}

function adminForm(title: string) {
  const fd = new FormData();
  for (const [k, v] of Object.entries({
    title,
    startDate: "2026-10-23",
    startTime: "13:30",
    endDate: "2026-10-23",
    endTime: "14:30",
    recurrenceFreq: "weekly",
    recurrenceByWeekday: "FR",
  })) fd.set(k, v);
  return fd;
}

beforeAll(async () => {
  await db.insert(users).values({ id: "u-admin", email: "admin@ucsc.edu" });
  const [a] = await db.insert(admins).values({ userId: "u-admin" }).returning();
  h.adminId = a.id;
});

beforeEach(async () => {
  process.env.EVENT_IMPORT_TOKEN = TOKEN;
  await db.delete(rateLimits);
  h.revalidatePath.mockClear();
});

describe("authentication", () => {
  it("rejects a missing or wrong token with 401 and writes nothing", async () => {
    const missing = await post(req(upsert("auth-1")), { token: null });
    expect(missing.status).toBe(401);
    expect(missing.json.error).toBe("unauthorized");
    expect(missing.headers.get("www-authenticate")).toMatch(/^Bearer/);

    const wrong = await post(req(upsert("auth-1")), { token: `${TOKEN}x` });
    expect(wrong.status).toBe(401);

    expect(await eventBySourceId("auth-1")).toBeUndefined();
    expect(await db.select().from(rateLimits)).toHaveLength(0);
  });

  it("is turned off (503) while the env var is unset or too short", async () => {
    delete process.env.EVENT_IMPORT_TOKEN;
    expect((await post(req(upsert("auth-2")))).status).toBe(503);
    process.env.EVENT_IMPORT_TOKEN = "short-token";
    const r = await post(req(upsert("auth-2")), { token: "short-token" });
    expect(r.status).toBe(503);
    expect(r.json.error).toBe("import_disabled");
    expect(await eventBySourceId("auth-2")).toBeUndefined();
  });

  it("isn't behind proxy.ts, which only matches /admin", () => {
    const proxy = fs.readFileSync("proxy.ts", "utf8");
    const matcher = proxy.match(/matcher:\s*\[([^\]]*)\]/)?.[1] ?? "";
    expect(matcher).toContain("/admin/:path*");
    expect(matcher).not.toMatch(/\/api|:path\*\s*"\s*,\s*"\//);
  });
});

describe("validation", () => {
  const bad: Array<[string, unknown]> = [
    ["an unknown top-level field", { ...req(upsert("v")), extra: 1 }],
    ["an unknown event field", req(upsert("v", { color: "red" }))],
    ["an impossible date", req(upsert("v", { date: "2026-02-31" }))],
    ["a time skipped by DST", req(upsert("v", { date: "2026-03-08", startTime: "02:30", endTime: "03:30" }))],
    ["a time repeated by DST", req(upsert("v", { date: "2026-11-01", startTime: "01:30", endTime: "02:30" }))],
    ["an end before the start", req(upsert("v", { startTime: "15:00", endTime: "14:00" }))],
    ["byWeekday on a daily event", req(upsert("v", { recurrence: { freq: "daily", byWeekday: ["MO"] } }))],
    ["the reserved source \"manual\"", { source: "manual", operations: [upsert("v")] }],
    ["more than 50 operations", req(...Array.from({ length: 51 }, (_, i) => upsert(`v${i}`)))],
    ["no operations", req()],
    ["an unknown op", req({ op: "delete", sourceId: "v" })],
    ["a title over 200 characters", req(upsert("v", { title: "x".repeat(201) }))],
    ["a dryRun that isn't a boolean", { ...req(upsert("v")), dryRun: "yes" }],
  ];

  it.each(bad)("rejects %s with 400 invalid_request and applies nothing", async (_, body) => {
    const r = await post(body);
    expect(r.status).toBe(400);
    expect(r.json.error).toBe("invalid_request");
    expect(r.json.issues?.length).toBeGreaterThan(0);
    expect(await eventBySourceId("v")).toBeUndefined();
  });

  it("rejects bad JSON and non-JSON content types", async () => {
    expect((await post(null, { raw: "{not json" })).json.error).toBe("invalid_json");
    expect((await post(req(upsert("v")), { contentType: "text/plain" })).status).toBe(415);
  });
});

describe("upsert", () => {
  it("creates once; the same request again changes nothing", async () => {
    const first = await post(req(upsert("wa-create")));
    expect(first.status).toBe(200);
    expect(first.json.results).toEqual([
      { index: 0, op: "upsert", sourceId: "wa-create", status: "created", eventId: expect.any(String) },
    ]);
    const eventId = first.json.results![0].eventId;

    const row = await eventBySourceId("wa-create");
    expect(row.startTime.toISOString()).toBe("2026-10-23T20:30:00.000Z"); // 13:30 PDT
    expect(row.source).toBe("whatsapp");
    expect(row.createdByAdminId).toBeNull();
    expect(row.importedAt).toBeInstanceOf(Date);
    const before = { ...row };

    const again = await post(req(upsert("wa-create")));
    expect(again.json.results).toEqual([
      { index: 0, op: "upsert", sourceId: "wa-create", status: "unchanged", eventId },
    ]);
    const rows = await db.select().from(events).where(eq(events.sourceId, "wa-create"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(before);
  });

  it("updates changed fields", async () => {
    await post(req(upsert("wa-update")));
    const r = await post(req(upsert("wa-update", { title: "Jummah (moved)", startTime: "13:45", endTime: "14:45" }, { sourceRef: "WhatsApp, 2026-10-20 18:04" })));
    expect(r.json.results![0].status).toBe("updated");
    const row = await eventBySourceId("wa-update");
    expect(row.title).toBe("Jummah (moved)");
    expect(row.startTime.toISOString()).toBe("2026-10-23T20:45:00.000Z");
    expect(row.sourceRef).toBe("WhatsApp, 2026-10-20 18:04");
  });
});

describe("cancel and restore", () => {
  it("cancels the whole event: off the calendar, sticky under upsert, undone by restore", async () => {
    await post(req(upsert("wa-cancel")));
    const day = [new Date("2026-10-23T07:00:00.000Z"), new Date("2026-10-24T07:00:00.000Z")] as const;
    const onCalendar = async () =>
      (await getOccurrencesInRange(...day)).some((o) => o.title === "Halaqa" || o.eventId === (row?.id ?? ""));
    let row = await eventBySourceId("wa-cancel");
    expect(await onCalendar()).toBe(true);

    expect((await post(req({ op: "cancel", sourceId: "wa-cancel" }))).json.results![0].status).toBe("cancelled");
    expect((await post(req({ op: "cancel", sourceId: "wa-cancel" }))).json.results![0].status).toBe("unchanged");
    row = await eventBySourceId("wa-cancel");
    expect(row.cancelledAt).toBeInstanceOf(Date);
    expect(await onCalendar()).toBe(false);

    // Re-sending the original announcement doesn't bring it back.
    expect((await post(req(upsert("wa-cancel")))).json.results![0].status).toBe("unchanged");
    expect((await eventBySourceId("wa-cancel")).cancelledAt).toBeInstanceOf(Date);

    expect((await post(req({ op: "restore", sourceId: "wa-cancel" }))).json.results![0].status).toBe("restored");
    expect(await onCalendar()).toBe(true);
  });

  it("cancels and restores one occurrence of a recurring event", async () => {
    await post(req(upsert("wa-occ")));
    const row = await eventBySourceId("wa-occ");
    const cancel = (date: string) => post(req({ op: "cancel", sourceId: "wa-occ", occurrenceDate: date }));

    expect((await cancel("2026-10-30")).json.results![0]).toMatchObject({ status: "cancelled", occurrenceDate: "2026-10-30" });
    expect((await cancel("2026-10-30")).json.results![0].status).toBe("unchanged");
    expect((await cancel("2026-10-31")).json.results![0]).toMatchObject({ status: "not_found", reason: "no_occurrence_on_date" });
    expect(await db.select().from(eventCancellations).where(eq(eventCancellations.eventId, row.id)))
      .toEqual([{ eventId: row.id, occurrenceDate: "2026-10-30" }]);

    const restored = await post(req({ op: "restore", sourceId: "wa-occ", occurrenceDate: "2026-10-30" }));
    expect(restored.json.results![0].status).toBe("restored");
    expect(await db.select().from(eventCancellations).where(eq(eventCancellations.eventId, row.id))).toEqual([]);
  });

  it("reports unknown source ids as not_found", async () => {
    const r = await post(req({ op: "cancel", sourceId: "nope" }));
    expect(r.json.results).toEqual([{ index: 0, op: "cancel", sourceId: "nope", status: "not_found" }]);
  });
});

describe("batches", () => {
  it("returns one result per operation, in order", async () => {
    await post(req(upsert("b-same"), upsert("b-change"), upsert("b-cancel")));
    const r = await post(req(
      upsert("b-new"),
      upsert("b-same"),
      upsert("b-change", { title: "Changed" }),
      { op: "cancel", sourceId: "b-unknown" },
      { op: "cancel", sourceId: "b-cancel" },
    ));
    expect(r.status).toBe(200);
    expect(r.json.results!.map((x) => [x.index, x.sourceId, x.status])).toEqual([
      [0, "b-new", "created"],
      [1, "b-same", "unchanged"],
      [2, "b-change", "updated"],
      [3, "b-unknown", "not_found"],
      [4, "b-cancel", "cancelled"],
    ]);
  });
});

describe("conflicts with admin changes", () => {
  it("doesn't overwrite an event an admin edited, unless override is set", async () => {
    const created = await post(req(upsert("c-edit")));
    const id = created.json.results![0].eventId as string;
    await updateEvent(id, adminForm("Jummah — Bring a friend"));

    const r = await post(req(upsert("c-edit", { title: "Jummah (from WhatsApp)" })));
    expect(r.json.results![0]).toMatchObject({ status: "conflict", reason: "edited_by_admin", eventId: id });
    expect((await eventBySourceId("c-edit")).title).toBe("Jummah — Bring a friend");

    const forced = await post(req(upsert("c-edit", { title: "Jummah (from WhatsApp)" }, { override: true })));
    expect(forced.json.results![0].status).toBe("updated");
    const row = await eventBySourceId("c-edit");
    expect(row.title).toBe("Jummah (from WhatsApp)");
    expect(row.adminEditedAt).toBeNull();
  });

  it("doesn't re-create an event an admin deleted, unless override is set", async () => {
    const created = await post(req(upsert("c-del")));
    await deleteEvent(created.json.results![0].eventId as string);
    expect(await db.select().from(eventImportTombstones).where(eq(eventImportTombstones.sourceId, "c-del"))).toHaveLength(1);

    expect((await post(req(upsert("c-del")))).json.results![0]).toMatchObject({ status: "conflict", reason: "deleted_by_admin" });
    expect((await post(req({ op: "cancel", sourceId: "c-del" }))).json.results![0]).toMatchObject({ status: "conflict", reason: "deleted_by_admin" });
    expect(await eventBySourceId("c-del")).toBeUndefined();

    const forced = await post(req(upsert("c-del", {}, { override: true })));
    expect(forced.json.results![0].status).toBe("created");
    expect(await eventBySourceId("c-del")).toBeDefined();
    expect(await db.select().from(eventImportTombstones).where(eq(eventImportTombstones.sourceId, "c-del"))).toHaveLength(0);
  });
});

describe("dry run", () => {
  const dry = (...operations: unknown[]) => ({ ...req(...operations), dryRun: true });

  it("reports a create without writing it or revalidating", async () => {
    const r = await post(dry(upsert("dry-new")));
    expect(r.status).toBe(200);
    expect(r.json.dryRun).toBe(true);
    expect(r.json.results).toEqual([
      { index: 0, op: "upsert", sourceId: "dry-new", status: "created", eventId: expect.any(String), dryRun: true },
    ]);
    expect(await eventBySourceId("dry-new")).toBeUndefined();
    expect(await db.select().from(events).where(eq(events.id, r.json.results![0].eventId as string))).toEqual([]);
    expect(h.revalidatePath).not.toHaveBeenCalled();
    // It still counts against the rate limit, like any request with the token.
    expect((await db.select().from(rateLimits)).length).toBeGreaterThan(0);
  });

  it("gives the results a real run would, and leaves existing data as it was", async () => {
    await post(req(upsert("dry-a"), upsert("dry-b"), upsert("dry-c")));
    await deleteEvent((await eventBySourceId("dry-c")).id);
    const snapshot = async () => ({
      events: await db.select().from(events).where(eq(events.source, "whatsapp")),
      cancellations: await db.select().from(eventCancellations),
      tombstones: await db.select().from(eventImportTombstones),
    });
    const before = await snapshot();
    const ops = [
      upsert("dry-a", { title: "Jummah (moved)" }),
      { op: "cancel", sourceId: "dry-b", occurrenceDate: "2026-10-30" },
      { op: "cancel", sourceId: "dry-b" },
      upsert("dry-c", {}, { override: true }),
      upsert("dry-a", { title: "Jummah (moved)" }),
      { op: "restore", sourceId: "dry-unknown" },
    ];
    h.revalidatePath.mockClear();

    const preview = await post(dry(...ops));
    expect(preview.json.results!.map((x) => [x.sourceId, x.status, x.dryRun])).toEqual([
      ["dry-a", "updated", true],
      ["dry-b", "cancelled", true],
      ["dry-b", "cancelled", true],
      ["dry-c", "created", true],
      ["dry-a", "unchanged", true],
      ["dry-unknown", "not_found", true],
    ]);
    expect(await snapshot()).toEqual(before);
    expect(h.revalidatePath).not.toHaveBeenCalled();

    const real = await post(req(...ops));
    expect(real.json.dryRun).toBeUndefined();
    expect(real.json.results!.map((x) => [x.sourceId, x.status, x.dryRun])).toEqual(
      preview.json.results!.map((x) => [x.sourceId, x.status, undefined])
    );
  });
});

describe("rate limiting", () => {
  it("answers 429 with Retry-After after 30 requests in 10 minutes from one token and IP", async () => {
    const body = req({ op: "cancel", sourceId: "rl-unknown" });
    for (let i = 0; i < 30; i++) {
      expect((await post(body, { ip: "198.51.100.9" })).status).toBe(200);
    }
    const limited = await post(body, { ip: "198.51.100.9" });
    expect(limited.status).toBe(429);
    expect(limited.json.error).toBe("rate_limited");
    const retryAfter = Number(limited.headers.get("retry-after"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(600);
    // Another IP with the same token still gets through (until the per-token cap).
    expect((await post(body, { ip: "198.51.100.10" })).status).toBe(200);
  });
});

describe("revalidation", () => {
  it("refreshes the landing page, calendar, sitemap and the event's page when something changed", async () => {
    const r = await post(req(upsert("rv-1")));
    const id = r.json.results![0].eventId;
    const paths = h.revalidatePath.mock.calls.map((c) => c[0]);
    expect(paths).toEqual(expect.arrayContaining(["/", "/calendar", "/admin", "/sitemap.xml", `/calendar/events/${id}`]));

    h.revalidatePath.mockClear();
    await post(req(upsert("rv-1")));
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });
});
