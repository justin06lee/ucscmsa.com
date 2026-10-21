// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bestImage, fetchInstagramPosts, IgStop, readInstagramExport, shapeItem, type IgFeedItem } from "./ig-posts";

describe("bestImage", () => {
  it("picks the largest candidate by area", () => {
    expect(bestImage({ candidates: [{ url: "small", width: 100, height: 100 }, { url: "big", width: 1080, height: 1350 }] })).toBe("big");
  });
  it("returns undefined with no candidates", () => {
    expect(bestImage(undefined)).toBeUndefined();
    expect(bestImage({ candidates: [] })).toBeUndefined();
  });
});

const image = (code: string, takenAt: number): IgFeedItem => ({
  code,
  taken_at: takenAt,
  media_type: 1,
  caption: { text: `caption ${code}` },
  image_versions2: { candidates: [{ url: `http://img/${code}.jpg`, width: 1080, height: 1080 }] },
});

describe("shapeItem", () => {
  const cutoff = 1000;
  it("keeps an image post on or after the cutoff", () => {
    const s = shapeItem(image("A", 2000), cutoff);
    expect(s?.post.shortcode).toBe("A");
    expect(s?.post.mediaType).toBe("image");
    expect(s?.mediaNodes).toHaveLength(1);
  });
  it("skips a post older than the cutoff", () => {
    expect(shapeItem(image("B", 500), cutoff)).toBeNull();
  });
  it("skips a reel/video", () => {
    expect(shapeItem({ code: "C", taken_at: 2000, media_type: 2 }, cutoff)).toBeNull();
  });
  it("keeps only the image frames of a carousel", () => {
    const carousel: IgFeedItem = {
      code: "D",
      taken_at: 2000,
      media_type: 8,
      caption: { text: "cx" },
      carousel_media: [
        { media_type: 1, image_versions2: { candidates: [{ url: "u1", width: 10, height: 10 }] } },
        { media_type: 2 }, // a video inside the carousel
        { media_type: 1, image_versions2: { candidates: [{ url: "u2", width: 10, height: 10 }] } },
      ],
    };
    const s = shapeItem(carousel, cutoff);
    expect(s?.post.mediaType).toBe("carousel");
    expect(s?.mediaNodes).toHaveLength(2);
  });
  it("marks a pinned post", () => {
    const s = shapeItem({ ...image("E", 2000), timeline_pinned_user_ids: ["u"] }, cutoff);
    expect(s?.post.pinned).toBe(true);
  });
});

// A fake CDP that answers the three evaluate shapes the scraper makes:
// the profile-info API, the feed API, and an image download.
function fakeCdp(pages: Record<string, unknown>[], profile: unknown, onImage?: () => void) {
  let page = 0;
  return () =>
    Promise.resolve({
      send: async () => ({}),
      evaluate: async (_fn: string, arg?: unknown) => {
        const p = String(arg);
        if (p.startsWith("/api/v1/users/web_profile_info")) return { status: 200, url: "https://www.instagram.com/x/", text: JSON.stringify(profile) };
        if (p.startsWith("/api/v1/feed/user/")) return { status: 200, url: "https://www.instagram.com/x/", text: JSON.stringify(pages[Math.min(page++, pages.length - 1)]) };
        if (p.startsWith("http")) {
          onImage?.();
          return { status: 200, b64: Buffer.from("jpegbytes").toString("base64") };
        }
        return { status: 404, url: "", text: "" };
      },
      close: () => {},
    });
}

describe("readInstagramExport", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ig-export-"));
    mkdirSync(join(dir, "content"), { recursive: true });
    mkdirSync(join(dir, "media"), { recursive: true });
    writeFileSync(join(dir, "media", "a.jpg"), "jpg");
    writeFileSync(join(dir, "media", "b.jpg"), "jpg");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("reads image posts, resolves media paths, and skips video-only posts", () => {
    const posts = [
      { creation_timestamp: 2000, title: "Flyer one", media: [{ uri: "media/a.jpg", creation_timestamp: 2000 }] },
      { creation_timestamp: 3000, title: "A reel", media: [{ uri: "media/clip.mp4", creation_timestamp: 3000 }] },
      { title: "Carousel", media: [{ uri: "media/a.jpg", creation_timestamp: 4000, title: "Carousel" }, { uri: "media/b.jpg" }] },
    ];
    writeFileSync(join(dir, "content", "posts_1.json"), JSON.stringify(posts));
    const read = readInstagramExport(dir, new Date(1000 * 1000));
    expect(read.map((p) => p.shortcode)).toEqual(["ts2000", "ts4000"]); // reel skipped
    expect(read[0].url).toBe("instagram-export:ts2000");
    expect(read[0].images[0]).toBe(join(dir, "media", "a.jpg"));
    expect(read[1].mediaType).toBe("carousel");
    expect(read[1].images).toHaveLength(2);
  });

  it("honours the since cutoff", () => {
    writeFileSync(join(dir, "content", "posts_1.json"), JSON.stringify([{ creation_timestamp: 500, media: [{ uri: "media/a.jpg" }] }]));
    expect(readInstagramExport(dir, new Date(1000 * 1000))).toEqual([]);
  });
});

describe("fetchInstagramPosts (mocked CDP)", () => {
  let out: string;
  beforeEach(() => {
    out = mkdtempSync(join(tmpdir(), "ig-out-"));
  });
  afterEach(() => rmSync(out, { recursive: true, force: true }));

  const profile = { data: { user: { username: "ucsc.msa", id: "42", edge_owner_to_timeline_media: { count: 2 } } } };

  it("downloads images, writes the manifest, and skips reels", async () => {
    let downloads = 0;
    const feed = { items: [image("A", 2000), { code: "R", taken_at: 2000, media_type: 2 }], more_available: false };
    const posts = await fetchInstagramPosts({
      username: "ucsc.msa",
      since: new Date(1000 * 1000),
      outDir: out,
      sleep: () => Promise.resolve(),
      cdpFactory: fakeCdp([feed], profile, () => downloads++),
    });
    expect(posts.map((p) => p.shortcode)).toEqual(["A"]); // reel R skipped
    expect(downloads).toBe(1);
    expect(existsSync(join(out, "A-1.jpg"))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
    expect(manifest).toHaveLength(1);
    expect(manifest[0].images).toEqual(["A-1.jpg"]);
  });

  it("does not re-download an image already on disk", async () => {
    const feed = { items: [image("A", 2000)], more_available: false };
    let downloads = 0;
    const run = () =>
      fetchInstagramPosts({ username: "ucsc.msa", since: new Date(1000 * 1000), outDir: out, sleep: () => Promise.resolve(), cdpFactory: fakeCdp([feed], profile, () => downloads++) });
    await run();
    await run();
    expect(downloads).toBe(1); // second run reuses the file
  });

  it("throws IgStop when the API returns a challenge", async () => {
    const stopCdp = () =>
      Promise.resolve({
        send: async () => ({}),
        evaluate: async () => ({ status: 429, url: "https://www.instagram.com/x/", text: "please wait a few minutes before you try again" }),
        close: () => {},
      });
    await expect(
      fetchInstagramPosts({ username: "ucsc.msa", since: new Date(0), outDir: out, sleep: () => Promise.resolve(), cdpFactory: stopCdp }),
    ).rejects.toBeInstanceOf(IgStop);
  });
});
