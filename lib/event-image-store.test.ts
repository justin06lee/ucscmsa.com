import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { ImageRejectedError, MAX_IMAGE_BYTES, processEventImage } from "./event-image-store";

const jpeg = (width: number, height: number, color = { r: 200, g: 40, b: 60 }) =>
  sharp({ create: { width, height, channels: 3, background: color } }).jpeg().toBuffer();

describe("processEventImage", () => {
  it("makes card, page and full WebP variants and keeps the original size", async () => {
    const input = await jpeg(3000, 4000);
    const img = await processEventImage(input);
    expect(img.id).toBe(createHash("sha256").update(input).digest("hex").slice(0, 16));
    expect([img.w, img.h]).toEqual([3000, 4000]);
    expect([img.files.card.w, img.files.card.h]).toEqual([480, 640]);
    expect([img.files.page.w, img.files.page.h]).toEqual([1200, 1600]);
    expect([img.files.full.w, img.files.full.h]).toEqual([2000, 2667]);
    for (const f of Object.values(img.files)) {
      const meta = await sharp(f.data).metadata();
      expect(meta.format).toBe("webp");
      expect([meta.width, meta.height]).toEqual([f.w, f.h]);
    }
  });

  it("applies EXIF rotation, then drops all metadata", async () => {
    const input = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#123456" } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const img = await processEventImage(input);
    expect([img.w, img.h]).toEqual([300, 400]);
    // Never enlarged: every variant is the upload's own size.
    for (const f of Object.values(img.files)) {
      expect([f.w, f.h]).toEqual([300, 400]);
      const meta = await sharp(f.data).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.orientation).toBeUndefined();
    }
  });

  it("scales very tall images to at most 3:1", async () => {
    const img = await processEventImage(await jpeg(500, 5000));
    expect([img.files.card.w, img.files.card.h]).toEqual([144, 1440]);
    expect([img.files.page.w, img.files.page.h]).toEqual([360, 3600]);
  });

  it("accepts PNG and WebP", async () => {
    const png = await sharp({ create: { width: 10, height: 10, channels: 4, background: "#fff0" } }).png().toBuffer();
    const webp = await sharp(png).webp().toBuffer();
    expect((await processEventImage(png)).files.card.w).toBe(10);
    expect((await processEventImage(webp)).files.card.w).toBe(10);
  });

  it.each([
    ["an empty file", Buffer.alloc(0)],
    ["text", Buffer.from("not an image")],
    ["an SVG", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')],
    ["a file over the size limit", Buffer.alloc(MAX_IMAGE_BYTES + 1)],
  ])("rejects %s", async (_, input) => {
    await expect(processEventImage(input)).rejects.toBeInstanceOf(ImageRejectedError);
  });
});
