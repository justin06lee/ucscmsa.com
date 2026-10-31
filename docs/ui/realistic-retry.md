# Retrying the realistic paper jungle

Justin's verdict, 2026-10-31: the drawn version is the current direction, but only because the realistic one was poorly executed. The idea of real plant photos glued onto paper cut-outs still stands. This is what went wrong, as far as we can tell from how it was made, and what a proper version needs.

The attempt is on `feat/paper-jungle-photo` (tag `paper-jungle-photo-v1`), built by `scripts/make-jungle-photos.py`. The comparison videos are local only, in `docs/screenshots/paper-jungle-compare/`. Photo sources are in `docs/jungle-photo-sources.md` on that branch.

## What made it look bad, and what it needs

**Photo quality and cut-out edges**
- Nine photos from different places, cameras and light. One fern was lit against black and the others were in daylight. Some aren't local (Sweden, British Columbia).
- Three were reused for several plants: the lady fern twice, the lit fern three times, huckleberry for both shrubs.
- Outlines came from automatic masks. Apple Vision only found a rough foreground, and it found none at all for the huckleberry, so that was cut as a blurred blob of green with background left inside it.
- Needs: one consistent shoot or a tightly chosen set with the same soft, overcast light, ideally plants from around UCSC. Photograph single plants against a plain backdrop, or cut them by hand. Cut edges must follow real leaves, with no background inside and no frame cuts showing.

**Real crumpled-paper texture**
- The crumple was our generated `paper.webp` tile, the same one everywhere, multiplied over each image. It only changes brightness, so the photo still looks flat and printed.
- Needs: photographed or scanned crumpled paper, several sheets so nothing repeats, with folds big enough to read at phone size. The folds should bend the photo slightly as well as shade it.

**The paper margin**
- A mathematically even, bright band around every plant (9px on plants, 3 to 4px on trunks and treelines). It reads as a sticker outline. On lacy fronds the paper outweighs the plant.
- Needs: an uneven margin in straight scissor cuts, wider in some places and almost gone in others. Paper a little less white, and gaps too small to cut left as paper on purpose.

**Shadows and depth between layers**
- Nearly every layer has the same baked shadow, whatever its distance from the layer behind. Depth comes almost entirely from parallax, so a still frame looks like one flat collage.
- Needs: one light direction, with shadows growing with the real gap between layers: tight on the near plants' own pieces, wider between planes, almost none far back. Clear overlap between layers would help too.

**Colour matching**
- Each photo got only a desaturation and a mix toward the sky colour. Bark was warmed by hand. Saturated fern greens fight the pale sage sky, and the front hill went close to black.
- Far treelines were photos dropped into softened outlines of the drawn trees, which read as pale lumps rather than forest.
- Needs: one shared grade for every photo, matched to the page's palette. Lift the blacks, and let layers fade steadily toward the sky with distance. Build the far forest from real tree shapes.

## Keep from this attempt

- The page itself: layer order, parallax, letter motion, and plants that sit behind the title and tuck behind the paper edge. Plant files can be swapped by name, so a retry needs almost no code.
- CC0 or equivalent photos only, with every source listed.

## Before showing it again

- A single still, with no motion, must read as layered paper.
- Compare it next to the drawn version at phone and laptop width. It should be at least as quiet.
- Plant images still total about 1MB, and phones load the same files as laptops. It needs smaller phone versions before it ships, as does the drawn version.
