import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ revalidatePath: vi.fn(), adminId: 0 }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("@/lib/auth", () => ({ requireAdminId: async () => h.adminId }));
vi.mock("@/lib/db/client", async () => {
  const { createTestDb } = await import("@/test/db");
  return { db: (await createTestDb()).db };
});

import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { admins, events, rateLimits, users } from "@/lib/db/schema";
import { getOccurrencesInRange } from "@/lib/db/queries";
import { imageId } from "@/lib/event-image-store";
import type { EventImage } from "@/lib/event-image";
import { memoryStorage, setStorageForTests } from "@/lib/storage";
import {
  deleteEvent,
  removeEventImage,
  setEventImages,
  updateEvent,
  uploadEventImages,
} from "@/app/admin/_actions";
import { POST } from "../route";
import { PUT } from "./route";

const TOKEN = "test-import-token-0123456789-abcdefghij";
let mem: ReturnType<typeof memoryStorage>;

type Body = {
  ok: boolean;
  status?: string;
  reason?: string;
  error?: string;
  index?: number;
  dryRun?: boolean;
  eventId?: string;
  images?: EventImage[];
};

async function put(body: unknown, token: string | null = TOKEN) {
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await PUT(new Request("http://localhost/api/import/events/images", {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  }));
  return { status: res.status, json: (await res.json()) as Body };
}

// Imports an event and returns its id.
async function importEvent(sourceId: string, title = "Halaqa"): Promise<string> {
  const res = await POST(new Request("http://localhost/api/import/events", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({
      source: "whatsapp",
      operations: [{ op: "upsert", sourceId, event: { title, date: "2026-11-06", startTime: "18:00" } }],
    }),
  }));
  const json = await res.json();
  return json.results[0].eventId;
}

const color = (n: number) => ({ r: (n * 47) % 256, g: (n * 91) % 256, b: (n * 13) % 256 });
const jpeg = (n: number, width = 900, height = 1200) =>
  sharp({ create: { width, height, channels: 3, background: color(n) } }).jpeg().toBuffer();

// What MSA sync does: uploads the original under the event's folder.
async function upload(eventId: string, bytes: Buffer): Promise<string> {
  return mem.storage.put(`flyers/${eventId}/${imageId(bytes)}.jpg`, bytes, "image/jpeg");
}

const imagesOf = async (id: string) =>
  (await db.select({ images: events.images }).from(events).where(eq(events.id, id)))[0].images;
const req = (sourceId: string, images: unknown[], extra: Record<string, unknown> = {}) =>
  ({ source: "whatsapp", sourceId, images, ...extra });
const paths = () => [...mem.objects.keys()].sort();

beforeAll(async () => {
  await db.insert(users).values({ id: "u-admin", email: "admin@ucsc.edu" });
  const [a] = await db.insert(admins).values({ userId: "u-admin" }).returning();
  h.adminId = a.id;
});

beforeEach(async () => {
  process.env.EVENT_IMPORT_TOKEN = TOKEN;
  await db.delete(rateLimits);
  mem = memoryStorage();
  setStorageForTests(mem.storage);
  h.revalidatePath.mockClear();
});

// sharp encodes three variants per image; give slow CI machines room.
vi.setConfig({ testTimeout: 30_000 });

describe("PUT /api/import/events/images", () => {
  it("needs the token, and is off without a Blob store", async () => {
    expect((await put(req("x", []), null)).status).toBe(401);
    setStorageForTests(null);
    const off = await put(req("x", []));
    expect(off.status).toBe(503);
    expect(off.json.error).toBe("images_disabled");
  });

  it("attaches uploads as variants, deletes the uploads, and sees a resend as unchanged", async () => {
    const id = await importEvent("img-1");
    const a = await jpeg(1);
    const b = await jpeg(2, 3000, 2000);
    const urls = [await upload(id, a), await upload(id, b)];

    const r = await put(req("img-1", [{ url: urls[0], alt: "Halaqa flyer" }, { url: urls[1] }]));
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, status: "updated", eventId: id });
    const images = (await imagesOf(id))!;
    expect(r.json.images).toEqual(images);
    expect(images.map((i) => i.id)).toEqual([imageId(a), imageId(b)]);
    expect(images[0]).toMatchObject({ w: 900, h: 1200, alt: "Halaqa flyer", origin: "import" });
    expect(images[1]).toMatchObject({ w: 3000, h: 2000, page: { w: 1200, h: 800 }, full: { w: 2000, h: 1333 } });
    expect(images[1].card.url).toBe(`https://test.public.blob.vercel-storage.com/flyers/${id}/${imageId(b)}-card.webp`);
    // Only the server's variants are left: the uploads are gone.
    expect(paths()).toEqual([imageId(a), imageId(b)].flatMap((x) =>
      ["card", "full", "page"].map((v) => `flyers/${id}/${x}-${v}.webp`)).sort());
    expect(h.revalidatePath).toHaveBeenCalledWith(`/calendar/events/${id}`);

    // The same request again: its uploads no longer exist, but it's recognised.
    const again = await put(req("img-1", [{ url: urls[0], alt: "Halaqa flyer" }, { url: urls[1] }]));
    expect(again.json.status).toBe("unchanged");
    // So is the same list by id.
    expect((await put(req("img-1", [{ id: imageId(a) }, { id: imageId(b) }]))).json.status).toBe("unchanged");
  });

  it("reorders, edits alt text and removes by id, deleting removed images' files", async () => {
    const id = await importEvent("img-2");
    const [a, b, c] = await Promise.all([jpeg(3), jpeg(4), jpeg(5)]);
    await put(req("img-2", [{ url: await upload(id, a) }, { url: await upload(id, b) }, { url: await upload(id, c) }]));

    const r = await put(req("img-2", [{ id: imageId(c), alt: "Speaker" }, { id: imageId(a) }]));
    expect(r.json.status).toBe("updated");
    expect((await imagesOf(id))!.map((i) => [i.id, i.alt])).toEqual([[imageId(c), "Speaker"], [imageId(a), undefined]]);
    expect(paths().some((p) => p.includes(imageId(b)))).toBe(false);

    expect((await put(req("img-2", []))).json.status).toBe("updated");
    expect(await imagesOf(id)).toBeNull();
    expect(paths()).toEqual([]);
  });

  it("keeps one entry for the same picture listed twice or uploaded under another name", async () => {
    const id = await importEvent("img-3");
    const a = await jpeg(6);
    const url = await upload(id, a);
    const copy = await mem.storage.put(`flyers/${id}/copy.jpg`, a, "image/jpeg");
    const r = await put(req("img-3", [{ url }, { url: copy }]));
    expect(r.json.images!.map((i) => i.id)).toEqual([imageId(a)]);
  });

  it("refuses URLs outside the event's folder and unknown ids, changing nothing", async () => {
    const id = await importEvent("img-4");
    const other = await importEvent("img-4b");
    const a = await jpeg(7);
    for (const url of [
      `https://evil.example/flyers/${id}/x.jpg`,
      `https://test.public.blob.vercel-storage.com/other/${id}.jpg`,
      await upload(other, a),
      `https://test.public.blob.vercel-storage.com/flyers/${id}/`,
    ]) {
      const r = await put(req("img-4", [{ url }]));
      expect(r.status).toBe(400);
      expect(r.json.error).toBe("invalid_image_url");
    }
    const unknown = await put(req("img-4", [{ url: await upload(id, a) }, { id: "0123456789abcdef" }]));
    expect(unknown.status).toBe(400);
    expect(unknown.json).toMatchObject({ error: "unknown_image", index: 1 });
    expect(await imagesOf(id)).toBeNull();
    // The upload in that request was still deleted.
    expect(paths().filter((p) => p.startsWith(`flyers/${id}/`))).toEqual([]);
  });

  it("reports missing and unreadable uploads with their index; nothing is kept", async () => {
    const id = await importEvent("img-5");
    const good = await upload(id, await jpeg(8));
    const missing = await put(req("img-5", [{ url: good }, { url: `https://test.public.blob.vercel-storage.com/flyers/${id}/gone.jpg` }]));
    expect(missing.status).toBe(422);
    expect(missing.json).toMatchObject({ error: "image_missing", index: 1 });

    const good2 = await upload(id, await jpeg(9));
    const bad = await mem.storage.put(`flyers/${id}/bad.jpg`, Buffer.from("<html>"), "image/jpeg");
    const r = await put(req("img-5", [{ url: good2 }, { url: bad }]));
    expect(r.status).toBe(422);
    expect(r.json).toMatchObject({ error: "invalid_image", index: 1 });
    expect(await imagesOf(id)).toBeNull();
    expect(paths().filter((p) => p.startsWith(`flyers/${id}/`))).toEqual([]);
  });

  it("previews with dryRun without fetching, storing or deleting", async () => {
    const id = await importEvent("img-6");
    const url = await upload(id, await jpeg(10));
    const before = paths();
    const r = await put(req("img-6", [{ url }], { dryRun: true }));
    expect(r.json).toMatchObject({ status: "updated", dryRun: true });
    expect(await imagesOf(id)).toBeNull();
    expect(paths()).toEqual(before);
  });

  it("calendar occurrences carry the links, the first image and the image count", async () => {
    const id = await importEvent("img-11");
    const [a, b] = await Promise.all([jpeg(40), jpeg(41)]);
    await put(req("img-11", [{ url: await upload(id, a) }, { url: await upload(id, b) }]));
    await db.update(events).set({ links: [{ kind: "rsvp", label: "RSVP", url: "https://forms.gle/x" }] }).where(eq(events.id, id));
    const occ = (await getOccurrencesInRange(new Date("2026-11-06T00:00:00Z"), new Date("2026-11-08T00:00:00Z")))
      .find((o) => o.eventId === id)!;
    expect(occ.links).toEqual([{ kind: "rsvp", label: "RSVP", url: "https://forms.gle/x" }]);
    expect(occ.cover?.id).toBe(imageId(a));
    expect(occ.imageCount).toBe(2);
  });

  it("not_found for unknown events", async () => {
    expect((await put(req("img-nope", []))).json.status).toBe("not_found");
  });
});

describe("admin edits and images", () => {
  function adminForm(title: string) {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ title, startDate: "2026-11-06", startTime: "18:00", endDate: "2026-11-06" })) fd.set(k, v);
    return fd;
  }
  const file = async (n: number, name = `flyer-${n}.jpg`) =>
    new File([new Uint8Array(await jpeg(n))], name, { type: "image/jpeg" });

  it("an admin-edited event refuses importer images unless override; override keeps the admin mark", async () => {
    const id = await importEvent("img-7");
    expect((await updateEvent(id, adminForm("Halaqa (room change)"))).ok).toBe(true);
    const url = await upload(id, await jpeg(11));
    const r = await put(req("img-7", [{ url }]));
    expect(r.json).toMatchObject({ status: "conflict", reason: "edited_by_admin" });
    expect(paths()).toEqual([]); // the upload is deleted anyway

    const url2 = await upload(id, await jpeg(11));
    expect((await put(req("img-7", [{ url: url2 }], { override: true }))).json.status).toBe("updated");
    const [row] = await db.select().from(events).where(eq(events.id, id));
    expect(row.adminEditedAt).toBeInstanceOf(Date);
    expect(row.images).toHaveLength(1);
  });

  it("upload, replace, reorder, alt and remove from the admin form, each an admin edit", async () => {
    const id = await importEvent("img-8");
    const fd = new FormData();
    fd.append("image", await file(12));
    fd.append("image", await file(13));
    const added = await uploadEventImages(id, fd);
    expect(added.ok).toBe(true);
    const [first, second] = (await imagesOf(id))!;
    expect(first.origin).toBe("admin");
    expect(first.src).toBeUndefined();
    expect((await db.select().from(events).where(eq(events.id, id)))[0].adminEditedAt).toBeInstanceOf(Date);

    // The importer can no longer change them.
    const url = await upload(id, await jpeg(14));
    expect((await put(req("img-8", [{ url }]))).json.status).toBe("conflict");

    const replace = new FormData();
    replace.append("image", await file(15));
    replace.set("replaceId", first.id);
    expect((await uploadEventImages(id, replace)).ok).toBe(true);
    const afterReplace = (await imagesOf(id))!;
    expect(afterReplace.map((i) => i.id)).toEqual([afterReplace[0].id, second.id]);
    expect(afterReplace[0].id).not.toBe(first.id);
    expect(paths().some((p) => p.includes(first.id))).toBe(false);

    expect((await setEventImages(id, [{ id: second.id, alt: "Poster" }, { id: afterReplace[0].id }])).ok).toBe(true);
    expect((await imagesOf(id))!.map((i) => [i.id, i.alt])).toEqual([[second.id, "Poster"], [afterReplace[0].id, undefined]]);

    expect((await removeEventImage(id, second.id)).ok).toBe(true);
    expect((await imagesOf(id))!.map((i) => i.id)).toEqual([afterReplace[0].id]);
    expect(paths().some((p) => p.includes(second.id))).toBe(false);
  });

  it("refuses unreadable files, an 11th image and unknown ids", async () => {
    const id = await importEvent("img-9");
    const bad = new FormData();
    bad.append("image", new File(["hello"], "notes.txt", { type: "text/plain" }));
    expect(await uploadEventImages(id, bad)).toEqual({ ok: false, code: "image_rejected", error: "notes.txt: Not a readable image." });

    const ten = new FormData();
    for (let n = 20; n < 30; n++) ten.append("image", await file(n));
    expect((await uploadEventImages(id, ten)).ok).toBe(true);
    const one = new FormData();
    one.append("image", await file(30));
    expect(await uploadEventImages(id, one)).toEqual({ ok: false, code: "too_many", error: "An event can have at most 10 images" });

    expect(await setEventImages(id, [{ id: "0123456789abcdef" }])).toEqual({ ok: false, code: "image_removed", error: "That image was already removed. Reload the page." });
  });

  it("imports never touch images, and deleting the event deletes its files", async () => {
    const id = await importEvent("img-10");
    await put(req("img-10", [{ url: await upload(id, await jpeg(31)) }]));
    await importEvent("img-10", "Halaqa: new title");
    expect(await imagesOf(id)).toHaveLength(1);

    expect((await deleteEvent(id)).ok).toBe(true);
    expect(paths().filter((p) => p.startsWith(`flyers/${id}/`))).toEqual([]);
    const r = await put(req("img-10", []));
    expect(r.json).toMatchObject({ status: "conflict", reason: "deleted_by_admin" });
  });
});
