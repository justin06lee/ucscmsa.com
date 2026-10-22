import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const blob = vi.hoisted(() => ({
  put: vi.fn(async (pathname: string) => ({ url: `https://abc123.public.blob.vercel-storage.com/${pathname}` })),
  del: vi.fn(async () => {}),
  list: vi.fn(),
}));
vi.mock("@vercel/blob", () => blob);

import { blobHostForToken, getStorage, setStorageForTests } from "./storage";

const TOKEN = "vercel_blob_rw_AbC123_s3cretpart";

beforeEach(() => {
  process.env.BLOB_READ_WRITE_TOKEN = TOKEN;
  setStorageForTests(undefined);
  vi.clearAllMocks();
});
afterEach(() => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  setStorageForTests(undefined);
});

describe("Vercel Blob storage", () => {
  it("is off without a token, and finds the public host from the token", () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    expect(getStorage()).toBeNull();
    expect(blobHostForToken(TOKEN)).toBe("abc123.public.blob.vercel-storage.com");
    expect(blobHostForToken("garbage")).toBeNull();
  });

  it("accepts only plain https URLs on its own host", () => {
    const s = getStorage()!;
    expect(s.url("flyers/e1/a.jpg")).toBe("https://abc123.public.blob.vercel-storage.com/flyers/e1/a.jpg");
    expect(s.pathOf("https://ABC123.public.blob.vercel-storage.com/flyers/e1/a.jpg")).toBe("flyers/e1/a.jpg");
    for (const url of [
      "https://other.public.blob.vercel-storage.com/flyers/e1/a.jpg",
      "http://abc123.public.blob.vercel-storage.com/flyers/e1/a.jpg",
      "https://abc123.public.blob.vercel-storage.com/flyers/e1/a.jpg?x=1",
      "https://abc123.public.blob.vercel-storage.com/flyers/e1/a.jpg#x",
      "https://abc123.public.blob.vercel-storage.com/flyers//x.jpg",
      "https://user@abc123.public.blob.vercel-storage.com/flyers/e1/a.jpg",
      "not a url",
    ]) {
      expect(s.pathOf(url), url).toBeNull();
    }
    // Dot segments are resolved, so the path is where the URL really points;
    // callers then check the prefix.
    expect(s.pathOf("https://abc123.public.blob.vercel-storage.com/flyers/../secret.jpg")).toBe("secret.jpg");
    expect(s.pathOf("https://abc123.public.blob.vercel-storage.com/flyers/e1/%2e%2e/x.jpg")).toBe("flyers/x.jpg");
  });

  it("puts public objects at exactly the given path, overwriting", async () => {
    const url = await getStorage()!.put("flyers/e1/x-card.webp", Buffer.from("x"), "image/webp");
    expect(url).toBe("https://abc123.public.blob.vercel-storage.com/flyers/e1/x-card.webp");
    expect(blob.put).toHaveBeenCalledWith("flyers/e1/x-card.webp", Buffer.from("x"), expect.objectContaining({
      access: "public",
      token: TOKEN,
      contentType: "image/webp",
      addRandomSuffix: false,
      allowOverwrite: true,
    }));
  });

  it("deletes by URL, and a prefix page by page", async () => {
    const s = getStorage()!;
    await s.delete([]);
    expect(blob.del).not.toHaveBeenCalled();
    await s.delete(["flyers/e1/a.webp"]);
    expect(blob.del).toHaveBeenCalledWith(["https://abc123.public.blob.vercel-storage.com/flyers/e1/a.webp"], { token: TOKEN });

    blob.list
      .mockResolvedValueOnce({ blobs: [{ url: "u1" }, { url: "u2" }], hasMore: true, cursor: "c1" })
      .mockResolvedValueOnce({ blobs: [{ url: "u3" }], hasMore: false });
    await s.deletePrefix("flyers/e1/");
    expect(blob.list).toHaveBeenNthCalledWith(1, { prefix: "flyers/e1/", cursor: undefined, token: TOKEN });
    expect(blob.list).toHaveBeenNthCalledWith(2, { prefix: "flyers/e1/", cursor: "c1", token: TOKEN });
    expect(blob.del).toHaveBeenCalledWith(["u1", "u2"], { token: TOKEN });
    expect(blob.del).toHaveBeenCalledWith(["u3"], { token: TOKEN });
  });
});
