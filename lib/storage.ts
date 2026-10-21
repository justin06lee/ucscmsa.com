import { del, list, put } from "@vercel/blob";
import { blobHostForToken } from "./blob-host";

export { blobHostForToken };

// Where event images live: a public Vercel Blob store today, behind this
// small interface so another store (R2) can replace it. Paths are relative,
// e.g. "flyers/<event-id>/<id>-card.webp"; every object is publicly readable
// at url(path).

export interface ObjectStorage {
  url(path: string): string;
  // The path of a URL in this store, or null for any other URL.
  pathOf(url: string): string | null;
  put(path: string, body: Buffer, contentType: string): Promise<string>;
  // The object's bytes; null if it doesn't exist; throws TooLargeError past
  // maxBytes.
  get(path: string, maxBytes: number): Promise<Buffer | null>;
  delete(paths: string[]): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
}

export class TooLargeError extends Error {}

export const BLOB_TOKEN_ENV = "BLOB_READ_WRITE_TOKEN";

async function readLimited(res: Response, maxBytes: number): Promise<Buffer> {
  if (Number(res.headers.get("content-length") ?? 0) > maxBytes) throw new TooLargeError();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = res.body!.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new TooLargeError();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function vercelBlob(token: string, host: string): ObjectStorage {
  const url = (path: string) => `https://${host}/${path}`;
  const urls = (paths: string[]) => paths.map(url);
  return {
    url,
    pathOf(u) {
      let parsed: URL;
      try {
        parsed = new URL(u);
      } catch {
        return null;
      }
      if (parsed.protocol !== "https:" || parsed.host !== host || parsed.search || parsed.hash) return null;
      if (parsed.username || parsed.password) return null;
      const path = parsed.pathname.slice(1);
      return /^[A-Za-z0-9._/-]+$/.test(path) && !path.split("/").some((s) => s === "" || s === "..") ? path : null;
    },
    async put(path, body, contentType) {
      const blob = await put(path, body, {
        access: "public",
        token,
        contentType,
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 365 * 24 * 60 * 60,
      });
      return blob.url;
    },
    async get(path, maxBytes) {
      const res = await fetch(url(path), { cache: "no-store", redirect: "error" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Blob GET ${path}: ${res.status}`);
      return readLimited(res, maxBytes);
    },
    async delete(paths) {
      if (paths.length > 0) await del(urls(paths), { token });
    },
    async deletePrefix(prefix) {
      let cursor: string | undefined;
      do {
        const page = await list({ prefix, cursor, token });
        if (page.blobs.length > 0) await del(page.blobs.map((b) => b.url), { token });
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
    },
  };
}

let configured: ObjectStorage | null | undefined;

/** The image store, or null when BLOB_READ_WRITE_TOKEN isn't set. */
export function getStorage(): ObjectStorage | null {
  if (configured !== undefined) return configured;
  const token = process.env[BLOB_TOKEN_ENV]?.trim();
  const host = token ? blobHostForToken(token) : null;
  configured = token && host ? vercelBlob(token, host) : null;
  return configured;
}

/** Tests only: replaces the store getStorage() returns (null: unset). */
export function setStorageForTests(s: ObjectStorage | null | undefined) {
  configured = s;
}

/** An in-memory store for tests. */
export function memoryStorage(host = "test.public.blob.vercel-storage.com") {
  const objects = new Map<string, { body: Buffer; contentType: string }>();
  const url = (path: string) => `https://${host}/${path}`;
  const storage: ObjectStorage = {
    url,
    pathOf(u) {
      try {
        const p = new URL(u);
        return p.host === host && !p.search ? p.pathname.slice(1) : null;
      } catch {
        return null;
      }
    },
    async put(path, body, contentType) {
      objects.set(path, { body, contentType });
      return url(path);
    },
    async get(path, maxBytes) {
      const o = objects.get(path);
      if (!o) return null;
      if (o.body.length > maxBytes) throw new TooLargeError();
      return o.body;
    },
    async delete(paths) {
      for (const p of paths) objects.delete(p);
    },
    async deletePrefix(prefix) {
      for (const p of [...objects.keys()]) if (p.startsWith(prefix)) objects.delete(p);
    },
  };
  return { storage, objects };
}
