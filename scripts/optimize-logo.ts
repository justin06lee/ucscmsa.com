// Regenerates the WebP logo frames from the 480px PNG masters in
// public/letters/. Glyphs render at most 96px tall and the icon at most 200px,
// so 2x of that covers retina screens.
//
//   bun scripts/optimize-logo.ts
import sharp from "sharp";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "letters");

async function main() {
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".png"))) {
    const name = file.replace(/\.png$/, "");
    const src = path.join(dir, file);
    const targets = name.startsWith("icon-")
      ? [{ suffix: "-400", resize: { width: 400 } }, { suffix: "-192", resize: { width: 192 } }]
      : [{ suffix: "", resize: { height: 192 } }];
    for (const t of targets) {
      const out = path.join(dir, `${name}${t.suffix}.webp`);
      const info = await sharp(src).resize(t.resize).webp({ quality: 82, alphaQuality: 90, effort: 6 }).toFile(out);
      console.log(`${path.basename(out)}  ${info.width}x${info.height}  ${(info.size / 1024).toFixed(1)} KiB`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
