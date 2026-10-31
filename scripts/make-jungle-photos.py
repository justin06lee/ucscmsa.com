#!/usr/bin/env python3
"""Realistic route of the paper jungle: real CC0 plant photos glued onto crumpled
paper cut-outs. Each is cut to the plant's outline, with a slim paper margin, the
crumples showing through the photo, a lit cut edge and a cast shadow. Writes over
public/jungle/ with the same names and sizes as the paper version.
Photos and masks are in --src (see docs/jungle-photo-sources.md for where each is
from); treeline and hill outlines come from the paper version's files in --v1.
    python -I scripts/make-jungle-photos.py --src DIR --v1 DIR [name-filter]"""
import argparse
import numpy as np
from PIL import Image
from scipy import ndimage as ni

ap = argparse.ArgumentParser()
ap.add_argument("--src", required=True)
ap.add_argument("--v1", required=True)
ap.add_argument("only", nargs="?")
args = ap.parse_args()

CANOPY = np.array([0.894, 0.91, 0.8])
PAPER = np.array([0.97, 0.955, 0.92])
SHADOW = np.array([0.09, 0.137, 0.106])
TILE = np.asarray(Image.open("public/textures/paper.webp").convert("L"), dtype=np.float32) / 255


def photo(slug, crop=(0, 0, 1, 1), flip=False, turn=0):
    im = Image.open(f"{args.src}/{slug}/photo.jpg").convert("RGB")
    w, h = im.size
    box = (int(crop[0] * w), int(crop[1] * h), int(crop[2] * w), int(crop[3] * h))
    im = im.crop(box)
    mask = None
    try:
        m = Image.open(f"{args.src}/{slug}/mask.png").convert("L").resize((w, h)).crop(box)
        mask = m
    except FileNotFoundError:
        pass
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
        mask = mask.transpose(Image.FLIP_LEFT_RIGHT) if mask else None
    if turn:
        im = im.rotate(turn, expand=True)
        mask = mask.rotate(turn, expand=True) if mask else None
    return im, mask


def grade(rgb, mix=0.0, sat=0.88, gain=1.0):
    gray = rgb.mean(axis=2, keepdims=True)
    out = (gray + (rgb - gray) * sat) * gain
    return np.clip(out * (1 - mix) + CANOPY * mix, 0, 1)


def green_mask(rgb):
    """For a plant against darker ground: its green against everything else."""
    exg = ni.gaussian_filter(2 * rgb[..., 1] - rgb[..., 0] - rgb[..., 2], 9)
    return ni.binary_fill_holes(exg > max(0.05, np.percentile(exg, 45)))


def tidy(m, min_share=0.02, keep=4):
    m = ni.binary_opening(m, iterations=1)
    lab, n = ni.label(m)
    if not n:
        return m
    sizes = ni.sum(m, lab, range(1, n + 1))
    order = np.argsort(sizes)[::-1][:keep]
    good = [i + 1 for i in order if sizes[i] >= sizes[order[0]] * min_share]
    return np.isin(lab, good)


def shift(a, dy, dx):
    """Like np.roll, but what falls off an edge is gone rather than wrapping round."""
    return ni.shift(a, (dy, dx), order=0, mode="constant", cval=0)


def compose(name, rgb, m, margin=9, lift=1.0, photo_alpha=None):
    """rgb: H,W,3 float; m: bool, the plant's outline at the same size."""
    H, W = m.shape
    dist = ni.distance_transform_edt(~m)
    grown = ni.gaussian_filter((dist <= margin).astype(np.float32), 3.2) > 0.5
    # Scissors don't reach into small gaps: they stay paper.
    lab, n = ni.label(~grown)
    if n:
        sizes = ni.sum(~grown, lab, range(1, n + 1))
        small = [i + 1 for i, s in enumerate(sizes) if s < 900]
        grown = grown | np.isin(lab, small)
    # Soft edge so the paper doesn't stair-step.
    pa = np.clip(ni.gaussian_filter(grown.astype(np.float32), 0.8), 0, 1)
    tile = np.tile(TILE, (H // TILE.shape[0] + 1, W // TILE.shape[1] + 1))[:H, :W]
    crumple = np.clip(1 + (tile - tile.mean()) * 1.5, 0.72, 1.14)[..., None]
    paper = PAPER * crumple
    ph = ni.gaussian_filter(ni.binary_erosion(m, iterations=1).astype(np.float32), 0.7) if photo_alpha is None else photo_alpha
    contact = ni.gaussian_filter(shift(ph, 2, 1), 1.6)[..., None] * 0.34
    base = paper * (1 - contact) + SHADOW * contact
    glued = np.clip(rgb * crumple, 0, 1)
    color = base * (1 - ph[..., None]) + glued * ph[..., None]
    # The paper's cut edge: lit toward the top left, dark toward the bottom right.
    lit = np.clip(pa - shift(pa, 1, 1), 0, 1)[..., None]
    dark = np.clip(pa - shift(pa, -1, -1), 0, 1)[..., None]
    color = np.clip(color + lit * 0.5, 0, 1) * (1 - dark * 0.28)
    near = ni.gaussian_filter(shift(pa, int(3 * lift), int(2 * lift)), 1.6 * lift) * 0.3
    wide = ni.gaussian_filter(shift(pa, int(13 * lift), int(7 * lift)), 9 * lift) * 0.2
    sh = np.clip(near + wide, 0, 0.5)
    alpha = pa + (1 - pa) * sh
    out = (color * pa[..., None] + SHADOW * ((1 - pa) * sh)[..., None]) / np.maximum(alpha[..., None], 1e-4)
    rgba = np.dstack([np.clip(out, 0, 1), alpha])
    img = Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), "RGBA")
    img.save(f"public/jungle/{name}.webp", quality=68, alpha_quality=82, method=6)
    print(name, f"{W}x{H}", f"{__import__('os').path.getsize(f'public/jungle/{name}.webp') // 1024}KB")


def cut_plant(name, W, H, slug, crop=(0, 0, 1, 1), flip=False, turn=0, how="vision", anchor="bottom", mix=0.0, sat=0.88, gain=1.0, margin=9, fill=0.97, thresh=None, base_down=False, lean=0):
    im, mask = photo(slug, crop, flip, turn)
    rgb0 = np.asarray(im, dtype=np.float32) / 255
    if how == "vision":
        m = np.asarray(mask, dtype=np.float32) / 255 > 0.5
    elif how == "bright":
        m = ni.gaussian_filter(rgb0.max(axis=2), 1.2) > (thresh or 0.14)
    else:
        m = green_mask(rgb0)
    m = tidy(m)
    if base_down:
        # The photo's frame cuts the plant somewhere: turn that side to the bottom, hidden behind the hill.
        sides = [m[-1].sum(), m[:, -1].sum(), m[0].sum(), m[:, 0].sum()]  # bottom, right, top, left
        quarter = int(np.argmax(sides))
        if quarter:
            angle = {1: -90, 2: 180, 3: 90}[quarter]
            im = im.rotate(angle, expand=True)
            m = np.rot90(m, {-90: -1, 180: 2, 90: 1}[angle])
    if lean:
        im = im.rotate(lean, expand=True, fillcolor=(0, 0, 0))
        m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).rotate(lean, expand=True)) > 127
    ys, xs = np.where(m)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    k = min((W - 2 * margin - 8) * fill / (x1 - x0), (H - margin - 8) * fill / (y1 - y0))
    nw, nh = max(1, int((x1 - x0) * k)), max(1, int((y1 - y0) * k))
    part = im.crop((x0, y0, x1, y1)).resize((nw, nh), Image.LANCZOS)
    pm = Image.fromarray((m[y0:y1, x0:x1] * 255).astype(np.uint8)).resize((nw, nh), Image.LANCZOS)
    canvas = np.zeros((H, W, 3), dtype=np.float32)
    cm = np.zeros((H, W), dtype=bool)
    ox = (W - nw) // 2
    oy = H - nh if anchor == "bottom" else 0
    canvas[oy:oy + nh, ox:ox + nw] = np.asarray(part, dtype=np.float32) / 255
    cm[oy:oy + nh, ox:ox + nw] = np.asarray(pm) > 127
    compose(name, grade(canvas, mix, sat, gain), cm, margin=margin)


def cover(slug, W, H, crop=(0, 0, 1, 1)):
    im, _ = photo(slug, crop)
    k = max(W / im.width, H / im.height)
    im = im.resize((int(im.width * k) + 1, int(im.height * k) + 1), Image.LANCZOS)
    l, t = (im.width - W) // 2, (im.height - H) // 2
    return np.asarray(im.crop((l, t, l + W, t + H)), dtype=np.float32) / 255


def cut_outline(name, slug, crop=(0, 0, 1, 1), mix=0.0, sat=0.88, gain=1.0, margin=6, lift=1.0, soften=0):
    """A photo cut to the paper version's outline (treelines, hills), its thin tips softened to a mass of leaves."""
    a = np.asarray(Image.open(f"{args.v1}/{name}.webp").convert("RGBA"))[..., 3] / 255
    m = a > 0.82
    if soften:
        m = ni.gaussian_filter(m.astype(np.float32), soften) > 0.55
    m = ni.binary_erosion(m, iterations=max(1, margin // 2))
    H, W = m.shape
    compose(name, grade(cover(slug, W, H, crop), mix, sat, gain), m, margin=margin, lift=lift)


def cut_trunk(name, W, H, girth, seed, mix, gain=1.0):
    """A redwood trunk running out of frame, cut from real bark."""
    rng = np.random.default_rng(seed)
    half = W * girth
    cx = W / 2
    ys = np.arange(H) / H
    wob = ni.gaussian_filter1d(rng.normal(0, 1, H), 40) * 40
    flare = np.where(ys > 0.86, ((ys - 0.86) / 0.14) ** 2 * half * 0.55, 0)
    width = half * (0.62 + 0.38 * ys) + flare
    xx = np.arange(W)[None, :]
    left = cx - width + wob
    right = cx + width + wob * 0.6
    m = (xx > left[:, None]) & (xx < right[:, None])
    bark = cover("bark", int(W), H, (0.2, 0.05, 0.62, 0.6))
    warm = np.clip(bark * np.array([1.12, 0.86, 0.72]) * 0.86, 0, 1) ** 1.12
    compose(name, grade(warm, mix, 1.1, gain), m, margin=4)


JOBS = {
    "treeline-far": lambda n: cut_outline(n, "henry-cowell", (0, 0.4, 1, 0.8), mix=0.58, sat=0.8, lift=0.6, margin=3, soften=16),
    "treeline-mid": lambda n: cut_outline(n, "redwood-floor", (0, 0.35, 1, 0.75), mix=0.42, sat=0.9, gain=1.5, margin=3, soften=14),
    "redwood-b": lambda n: cut_trunk(n, 460, 1500, 0.15, 3, mix=0.5, gain=1.1),
    "redwood-a": lambda n: cut_trunk(n, 760, 1500, 0.19, 7, mix=0.24, gain=1.0),
    "shrub-a": lambda n: cut_plant(n, 780, 460, "huckleberry", (0.1, 0.2, 0.95, 0.9), how="green", gain=1.05),
    "shrub-b": lambda n: cut_plant(n, 640, 380, "huckleberry", (0.1, 0.2, 0.95, 0.9), flip=True, how="green", gain=0.82),
    "fern-a": lambda n: cut_plant(n, 820, 540, "berkeley-fern", gain=0.95),
    "fern-b": lambda n: cut_plant(n, 700, 460, "berkeley-fern", flip=True, mix=0.12),
    "fern-c": lambda n: cut_plant(n, 700, 460, "sword-frond", base_down=True, lean=-8, gain=0.85, fill=0.86),
    "fern-d": lambda n: cut_plant(n, 700, 460, "fern-black", how="bright", mix=0.28, gain=1.35),
    "palm-a": lambda n: cut_plant(n, 900, 1000, "lady-fern", turn=-75, gain=0.85, fill=0.86),
    "palm-b": lambda n: cut_plant(n, 760, 840, "fern-black", how="bright", gain=1.7, sat=1.05, fill=0.78),
    "palm-c": lambda n: cut_plant(n, 760, 840, "lady-fern", turn=-75, mix=0.45),
    "vine-a": lambda n: cut_plant(n, 420, 860, "fern-black", turn=180, how="bright", anchor="top", gain=1.25),
    "hill-deep": lambda n: cut_outline(n, "deer-fern", (0, 0.2, 1, 0.7), sat=0.85, gain=0.95, soften=6, margin=4),
    "hill-night": lambda n: cut_outline(n, "deer-fern", (0, 0.3, 1, 0.75), sat=0.85, gain=0.95, soften=2, margin=4),
}

for name, job in JOBS.items():
    if args.only and args.only not in name:
        continue
    job(name)
