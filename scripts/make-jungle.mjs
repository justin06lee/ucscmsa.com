// Renders the home page's paper cut-out plants (public/jungle/*.webp). Each one
// is a set of hand-faceted shapes in flat color run through an SVG filter that
// gives them paper fibre, a lit cut edge and a cast shadow, baked in so the
// parallax only ever moves plain images. Seeded: a run gives the same plants.
//   node scripts/make-jungle.mjs [name-filter]
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const TONE = {
  far: "#e0e4cb",
  back: "#c9d2ae",
  sage: "#b0bf92",
  mid: "#92a877",
  moss: "#6d8858",
  fern: "#527048",
  deep: "#39563f",
  night: "#2a4233",
  paper: "#f5efe2",
};

function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fmt = (n) => Math.round(n * 10) / 10;
/** A closed shape, always wound the same way so overlapping shapes never cancel to a hole. */
const path = (pts) => {
  let area = 0;
  pts.forEach(([x, y], i) => {
    const [nx, ny] = pts[(i + 1) % pts.length];
    area += x * ny - nx * y;
  });
  const wound = area < 0 ? [...pts].reverse() : pts;
  return `M${wound.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join("L")}Z`;
};
const between = (r, a, b) => a + (b - a) * r();
const RAD = Math.PI / 180;

/** A pointed leaf in straight scissor cuts. `belly` moves its widest point (0 base, 1 tip). */
function leaf(x, y, deg, len, wid, r, { facets = 5, belly = 0.42 } = {}) {
  const a = deg * RAD;
  const [ax, ay, nx, ny] = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a)];
  const side = (sign) => {
    const out = [];
    for (let i = 1; i < facets; i++) {
      const t = i / facets;
      const w = wid * Math.pow(Math.sin(Math.PI * Math.pow(t, Math.log(0.5) / Math.log(belly))), 0.85);
      const jt = t + between(r, -0.02, 0.02);
      const jw = w * between(r, 0.9, 1.08);
      out.push([x + ax * len * jt + nx * jw * sign, y + ay * len * jt + ny * jw * sign]);
    }
    return out;
  };
  return path([[x, y], ...side(1), [x + ax * len, y + ay * len], ...side(-1).reverse()]);
}

/** Walks a bending stem from (x, y); returns points with their heading. */
function stem(x, y, deg, len, bend, steps = 40) {
  const pts = [];
  let [px, py] = [x, y];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const h = deg + bend * t * t;
    pts.push({ x: px, y: py, h, t });
    px += Math.cos(h * RAD) * (len / steps);
    py += Math.sin(h * RAD) * (len / steps);
  }
  return pts;
}

/** A thin tapered strip along a stem. */
function strip(pts, w0, w1 = 0.6) {
  const left = [];
  const right = [];
  for (const p of pts) {
    const w = w0 + (w1 - w0) * p.t;
    const a = p.h * RAD;
    left.push([p.x - Math.sin(a) * w, p.y + Math.cos(a) * w]);
    right.push([p.x + Math.sin(a) * w, p.y - Math.cos(a) * w]);
  }
  return path([...left, ...right.reverse()]);
}

/** A sword fern frond: a stem with paired blades, shrinking to the tip. */
function frond(x, y, deg, len, bend, r, { blade = 0.2, n = 18 } = {}) {
  const pts = stem(x, y, deg, len, bend);
  const out = [strip(pts, Math.max(1.6, len * 0.006))];
  for (let i = 0; i < n; i++) {
    const t = 0.1 + (0.88 * i) / n;
    const p = pts[Math.round(t * (pts.length - 1))];
    const l = len * blade * Math.pow(Math.sin(Math.PI * (0.16 + 0.84 * t)), 0.7) * between(r, 0.92, 1.06);
    const spread = 74 - 34 * t;
    for (const s of [-1, 1]) {
      out.push(leaf(p.x, p.y, p.h + s * spread, l, l * 0.13, r, { facets: 3, belly: 0.3 }));
    }
  }
  return out.join("");
}

/** A big split leaf (the jungly one): slanted fingers either side of a midrib. */
function splitLeaf(x, y, deg, len, wid, bend, r, { fingers = 8, gap = 0.2 } = {}) {
  const pts = stem(x, y, deg, len, bend);
  const at = (t) => pts[Math.max(0, Math.min(pts.length - 1, Math.round(t * (pts.length - 1))))];
  const widthAt = (t) => wid * Math.pow(Math.sin(Math.PI * Math.pow(Math.min(t, 1), 0.72)), 0.8);
  const out = [];
  for (let i = 0; i < fingers; i++) {
    const t0 = 0.03 + (0.92 * i) / fingers;
    const t1 = 0.03 + (0.92 * (i + 1 - gap)) / fingers;
    const slant = 0.14;
    for (const s of [-1, 1]) {
      const a = at(t0);
      const b = at(t1);
      const oa = at(t0 + slant);
      const ob = at(t1 + slant);
      const n = (p) => [-Math.sin(p.h * RAD) * s, Math.cos(p.h * RAD) * s];
      const wa = widthAt(t0 + slant) * between(r, 0.92, 1.05);
      const wb = widthAt(t1 + slant) * between(r, 0.92, 1.05);
      const [nax, nay] = n(oa);
      const [nbx, nby] = n(ob);
      out.push(path([
        [a.x, a.y],
        [oa.x + nax * wa, oa.y + nay * wa],
        [ob.x + nbx * wb, ob.y + nby * wb],
        [b.x, b.y],
      ]));
    }
  }
  return { body: out.join(""), rib: strip(pts.slice(0, -1), Math.max(1.4, wid * 0.03)) };
}

/** A leafy dome: rings of pointed leaves around a base. */
function dome(cx, base, rx, ry, r, { rings = 4, leafLen = 0.3, leafWid = 0.1 } = {}) {
  const out = [];
  for (let k = 0; k < rings; k++) {
    const f = 1 - k / rings;
    const count = Math.round(10 + 16 * f);
    for (let i = 0; i < count; i++) {
      const deg = -176 + (172 * (i + between(r, 0.2, 0.8))) / count;
      const a = deg * RAD;
      const l = Math.min(rx, ry) * leafLen * between(r, 0.8, 1.2);
      const sx = cx + Math.cos(a) * rx * f * 0.72;
      const sy = base + Math.sin(a) * ry * f * 0.72;
      out.push(leaf(sx, sy, deg + between(r, -16, 16), l, l * leafWid * 3, r, { facets: 4 }));
    }
    out.push(path(Array.from({ length: 16 }, (_, i) => {
      const a = (-180 + (180 * i) / 15) * RAD;
      return [cx + Math.cos(a) * rx * f * 0.74, base + Math.sin(a) * ry * f * 0.74];
    })));
  }
  return out.join("");
}

/** A redwood as you see it from the forest floor: a huge ribbed trunk running out of frame, a few drooping boughs. */
function redwood(W, H, r, { girth = 0.27, boughs = 9 } = {}) {
  const cx = W / 2;
  const half = W * girth;
  const lean = between(r, -10, 10);
  const edge = (s) => {
    const out = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const flare = t > 0.86 ? Math.pow((t - 0.86) / 0.14, 2) * half * 0.55 : 0;
      out.push([cx + lean * (1 - t) + s * (half * (0.62 + 0.38 * t) + flare + between(r, -2.5, 2.5)), H * t]);
    }
    return out;
  };
  const out = [path([...edge(-1), ...edge(1).reverse()])];
  // Boughs: a thin arching stem with slim leaves hanging off it, higher up only.
  for (let i = 0; i < boughs; i++) {
    const y = between(r, H * 0.01, H * 0.5);
    const s = i % 2 ? 1 : -1;
    const l = (W / 2 - half * 0.5 - 34) * between(r, 0.7, 1);
    const pts = stem(cx + s * half * 0.5, y, s === 1 ? between(r, -8, 8) : 180 + between(r, -8, 8), l, s * between(r, 18, 34), 14);
    out.push(strip(pts, Math.max(2, W * 0.008), 0.8));
    for (const p of pts.slice(2)) {
      const hang = l * between(r, 0.14, 0.24) * (1.15 - p.t * 0.55);
      out.push(leaf(p.x, p.y, 90 - s * between(r, 2, 34), hang, hang * 0.12, r, { facets: 3, belly: 0.35 }));
      if (p.t > 0.3) out.push(leaf(p.x, p.y, p.h - s * 40, hang * 0.6, hang * 0.09, r, { facets: 3, belly: 0.35 }));
    }
  }
  const slits = [];
  for (let i = 0; i < 18; i++) {
    const x = cx + between(r, -half * 0.7, half * 0.7);
    const y0 = between(r, H * 0.12, H * 0.97);
    const h = between(r, H * 0.03, H * 0.11);
    slits.push(path([[x, y0], [x + 2.6, y0 + h * 0.45], [x + 0.8, y0 + h], [x - 1.4, y0 + h * 0.55]]));
  }
  return { body: out.join(""), slits: slits.join("") };
}

/** A strip of conifer tops over a solid mass, dipping low around `clearing` (0-1 of the width). */
function treeline(W, H, r, { base = 0.4, rise = 0.5, clearing = null, clearDepth = 0, step = 44 } = {}) {
  const dipAt = (x) => {
    if (clearing === null) return 1;
    const d = Math.abs(x / W - clearing) / 0.3;
    return d >= 1 ? 1 : 1 - clearDepth * Math.pow(Math.cos((d * Math.PI) / 2), 2);
  };
  const ground = [];
  for (let i = 0; i <= 60; i++) {
    const gx = (W * i) / 60;
    ground.push([gx, H - H * base * dipAt(gx) + Math.sin(i * 0.31) * 13 + Math.sin(i * 0.83 + 2) * 6]);
  }
  const shapes = [path([[0, H], ...ground, [W, H]])];
  let x = -step;
  while (x < W + step) {
    const dip = dipAt(x);
    const tall = H * (base * dip + rise * between(r, 0.32, 1) * dip);
    const wide = step * between(r, 1.3, 2.2);
    const tiers = Math.max(4, Math.round(tall / 34));
    const pts = [[x, H]];
    const edge = (sign) => {
      const out = [];
      for (let i = 0; i <= tiers; i++) {
        const t = i / tiers;
        const w = wide * Math.pow(1 - t, 0.82);
        const y = H - tall * t;
        out.push([x + sign * (w + between(r, -3, 3)), y]);
        if (i < tiers) out.push([x + sign * w * 0.6, y - (tall / tiers) * 0.34]);
      }
      return out;
    };
    pts.push(...edge(-1), [x, H - tall - between(r, 6, 18)], ...edge(1).reverse());
    shapes.push(path(pts));
    x += step * between(r, 0.7, 1.35);
  }
  return shapes.join("");
}

/** A hanging vine with broad leaves, from the top edge. */
function vine(W, H, r) {
  const cx = W * 0.62;
  const pts = stem(cx, -8, 92, H * 0.96, between(r, 16, 26), 44);
  const out = [strip(pts, 3.4, 1)];
  pts.forEach((p, i) => {
    if (i < 2 || i % 3) return;
    const s = i % 2 ? 1 : -1;
    const l = between(r, 58, 92) * (1.12 - p.t * 0.45);
    out.push(leaf(p.x, p.y, p.h + s * between(r, 44, 66), l, l * 0.38, r, { facets: 6, belly: 0.3 }));
  });
  return out.join("");
}

/** The edge of the page's paper: a low cut hill with grass and leaf tips. */
function sheetEdge(W, H, r) {
  const top = [];
  const steps = 96;
  for (let i = 0; i <= steps; i++) {
    const x = (W * i) / steps;
    const roll = Math.sin(i * 0.19) * 16 + Math.sin(i * 0.47 + 1.4) * 8;
    top.push([x, H * 0.62 + roll + between(r, -3, 3)]);
  }
  const shapes = [path([[-30, H + 30], [-30, top[0][1]], ...top, [W + 30, top[steps][1]], [W + 30, H + 30]])];
  for (let i = 0; i < 74; i++) {
    const j = Math.floor(r() * steps);
    const [x, y] = top[j];
    const l = between(r, 24, 74);
    const d = between(r, -118, -62);
    shapes.push(leaf(x, y + 8, d, l, l * between(r, 0.07, 0.15), r, { facets: 3, belly: 0.25 }));
  }
  return shapes.join("");
}

/** The longest a stem from the base can run at this heading and stay inside its image. */
function fits(W, H, x, deg, len) {
  const c = Math.cos(deg * RAD);
  const up = Math.max(0.05, -Math.sin(deg * RAD));
  const side = (c < 0 ? W * x : W * (1 - x)) - 30;
  return Math.min(len, ((H - 30) / up) * 0.9, (side / Math.max(0.05, Math.abs(c))) * 0.92);
}

function fernClump(W, H, r, { fronds = 11, reach = 0.8, x = 0.42, from = -158, to = -14 } = {}) {
  const out = [];
  for (let i = 0; i < fronds; i++) {
    const f = i / (fronds - 1);
    const deg = from + (to - from) * f + between(r, -9, 9);
    const lean = (deg + 90) / 72;
    const len = fits(W, H, x, deg, Math.min(W, H * 1.4) * reach * between(r, 0.52, 1.04));
    out.push(frond(W * x + between(r, -22, 22), H - 2, deg, len, lean * between(r, 18, 58), r));
  }
  return out.join("");
}

function palm(W, H, r, { leaves = 6, reach = 0.98, wid = 0.105, x = 0.26, from = -112, to = -8 } = {}) {
  const bodies = [];
  const ribs = [];
  for (let i = 0; i < leaves; i++) {
    const f = leaves === 1 ? 0.5 : i / (leaves - 1);
    const deg = from + (to - from) * f + between(r, -8, 8);
    const lean = (deg + 60) / 60;
    const len = fits(W, H, x, deg, Math.min(H, W * 1.05) * reach * between(r, 0.62, 1));
    const { body, rib } = splitLeaf(W * x + between(r, -12, 12), H, deg, len, len * wid * between(r, 0.9, 1.15), lean * between(r, 28, 62), r);
    bodies.push({ body, rib });
  }
  return bodies;
}

const S = (d, fill) => `<path d="${d}" fill="${fill}"/>`;
const pieces = (...list) => list; // [{ d, fill, slits?, flat? }], back to front

const ASSETS = {
  "treeline-far": { w: 2400, h: 620, seed: 11, draw: (w, h, r) => pieces({ d: treeline(w, h, r, { base: 0.34, rise: 0.58, step: 40 }), fill: TONE.far, soft: true }) },
  "treeline-mid": { w: 2400, h: 560, seed: 23, draw: (w, h, r) => pieces({ d: treeline(w, h, r, { base: 0.42, rise: 0.56, clearing: 0.5, clearDepth: 0.72, step: 58 }), fill: TONE.back }) },
  "redwood-a": { w: 760, h: 1500, seed: 31, draw: (w, h, r) => { const t = redwood(w, h, r, { girth: 0.19, boughs: 10 }); return pieces({ d: t.body, fill: TONE.sage, slits: t.slits }); } },
  "redwood-b": { w: 460, h: 1500, seed: 37, draw: (w, h, r) => { const t = redwood(w, h, r, { girth: 0.15, boughs: 9 }); return pieces({ d: t.body, fill: TONE.back, slits: t.slits }); } },
  "fern-a": { w: 820, h: 540, seed: 41, draw: (w, h, r) => pieces({ d: fernClump(w, h, r, { fronds: 9 }), fill: TONE.fern }, { d: fernClump(w, h, r, { fronds: 7, reach: 0.62 }), fill: TONE.moss }) },
  "fern-b": { w: 700, h: 460, seed: 47, draw: (w, h, r) => pieces({ d: fernClump(w, h, r, { fronds: 8 }), fill: TONE.moss }, { d: fernClump(w, h, r, { fronds: 6, reach: 0.6 }), fill: TONE.mid }) },
  "fern-c": { w: 700, h: 460, seed: 53, draw: (w, h, r) => pieces({ d: fernClump(w, h, r, { fronds: 8 }), fill: TONE.deep }, { d: fernClump(w, h, r, { fronds: 6, reach: 0.62 }), fill: TONE.fern }) },
  "shrub-a": { w: 780, h: 460, seed: 59, draw: (w, h, r) => pieces({ d: dome(w * 0.5, h, w * 0.46, h * 0.86, r), fill: TONE.moss }, { d: dome(w * 0.42, h, w * 0.3, h * 0.56, r), fill: TONE.mid }) },
  "shrub-b": { w: 640, h: 380, seed: 61, draw: (w, h, r) => pieces({ d: dome(w * 0.5, h, w * 0.46, h * 0.84, r), fill: TONE.deep }, { d: dome(w * 0.58, h, w * 0.3, h * 0.54, r), fill: TONE.fern }) },
  "palm-a": { w: 900, h: 1000, seed: 67, draw: (w, h, r) => {
    const back = palm(w, h, r, { leaves: 4 });
    const front = palm(w, h, r, { leaves: 3, reach: 0.68, from: -92, to: -18 });
    return pieces(
      { d: back.map((l) => l.body).join(""), fill: TONE.deep, ribs: back.map((l) => l.rib).join(""), ribFill: TONE.fern },
      { d: front.map((l) => l.body).join(""), fill: TONE.night, ribs: front.map((l) => l.rib).join(""), ribFill: TONE.deep },
    );
  } },
  "palm-b": { w: 760, h: 840, seed: 71, draw: (w, h, r) => {
    const back = palm(w, h, r, { leaves: 4, from: -104, to: -14 });
    const front = palm(w, h, r, { leaves: 2, reach: 0.64, from: -80, to: -30 });
    return pieces(
      { d: back.map((l) => l.body).join(""), fill: TONE.fern, ribs: back.map((l) => l.rib).join(""), ribFill: TONE.mid },
      { d: front.map((l) => l.body).join(""), fill: TONE.deep, ribs: front.map((l) => l.rib).join(""), ribFill: TONE.fern },
    );
  } },
  "palm-c": { w: 760, h: 840, seed: 97, draw: (w, h, r) => {
    const back = palm(w, h, r, { leaves: 4, from: -104, to: -14 });
    const front = palm(w, h, r, { leaves: 2, reach: 0.64, from: -80, to: -30 });
    return pieces(
      { d: back.map((l) => l.body).join(""), fill: TONE.sage, ribs: back.map((l) => l.rib).join(""), ribFill: TONE.back },
      { d: front.map((l) => l.body).join(""), fill: TONE.mid, ribs: front.map((l) => l.rib).join(""), ribFill: TONE.sage },
    );
  } },
  "fern-d": { w: 700, h: 460, seed: 101, draw: (w, h, r) => pieces({ d: fernClump(w, h, r, { fronds: 8 }), fill: TONE.sage }, { d: fernClump(w, h, r, { fronds: 6, reach: 0.6 }), fill: TONE.mid }) },
  "vine-a": { w: 420, h: 860, seed: 73, draw: (w, h, r) => pieces({ d: vine(w, h, r), fill: TONE.fern }) },
  "hill-deep": { w: 2400, h: 300, seed: 79, draw: (w, h, r) => pieces({ d: treeline(w, h, r, { base: 0.5, rise: 0.3, step: 150 }), fill: TONE.moss }) },
  "hill-night": { w: 2400, h: 220, seed: 83, draw: (w, h, r) => pieces({ d: sheetEdge(w, h, r), fill: TONE.deep }) },
  "sheet-edge": { w: 2400, h: 220, seed: 89, draw: (w, h, r) => pieces({ d: sheetEdge(w, h, r), fill: TONE.paper, plain: true }) },
};

const shadowColor = "#17231b";

/** Paper fibre, a lit top-left cut edge, a darker bottom-right one, and a cast shadow. */
function filter(id, seed, { plain = false, soft = false, lift = 1 } = {}) {
  const fibre = plain
    ? `<feMerge result="grained"><feMergeNode in="SourceGraphic"/></feMerge>`
    : `<feTurbulence type="fractalNoise" baseFrequency="0.018 0.05" numOctaves="3" seed="${seed}" result="wide"/>
       <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${seed + 1}" result="fine"/>
       <feComposite in="wide" in2="fine" operator="arithmetic" k2="0.6" k3="0.5" result="n"/>
       <feDiffuseLighting in="n" surfaceScale="${soft ? 0.5 : 0.9}" diffuseConstant="1.08" lighting-color="#ffffff" result="lit"><feDistantLight azimuth="235" elevation="64"/></feDiffuseLighting>
       <feComposite in="lit" in2="SourceGraphic" operator="arithmetic" k1="1" result="grained"/>`;
  const shadow = plain
    ? `<feGaussianBlur in="SourceAlpha" stdDeviation="2"/><feOffset dy="-2"/><feFlood flood-color="${shadowColor}" flood-opacity="0.2"/><feComposite in2="SourceAlpha" operator="out" result="ignored"/>`
    : "";
  return `<filter id="${id}" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">
    ${fibre}${shadow}
    <feOffset in="SourceAlpha" dx="1.4" dy="1.4" result="downRight"/>
    <feComposite in="SourceAlpha" in2="downRight" operator="out" result="edgeTL"/>
    <feFlood flood-color="#ffffff" flood-opacity="${plain ? 0.9 : soft ? 0.5 : 0.62}"/><feComposite in2="edgeTL" operator="in" result="lightEdge"/>
    <feOffset in="SourceAlpha" dx="-1.2" dy="-1.2" result="upLeft"/>
    <feComposite in="SourceAlpha" in2="upLeft" operator="out" result="edgeBR"/>
    <feFlood flood-color="${shadowColor}" flood-opacity="0.26"/><feComposite in2="edgeBR" operator="in" result="darkEdge"/>
    <feGaussianBlur in="SourceAlpha" stdDeviation="${1.5 * lift}"/><feOffset dx="${plain ? 0 : 2 * lift}" dy="${plain ? -2 : 3 * lift}" result="a1"/>
    <feFlood flood-color="${shadowColor}" flood-opacity="${plain ? 0.3 : soft ? 0.1 : 0.3}"/><feComposite in2="a1" operator="in" result="near"/>
    <feGaussianBlur in="SourceAlpha" stdDeviation="${9 * lift}"/><feOffset dx="${plain ? 0 : 7 * lift}" dy="${plain ? -7 : 13 * lift}" result="a2"/>
    <feFlood flood-color="${shadowColor}" flood-opacity="${plain ? 0.14 : soft ? 0.05 : 0.2}"/><feComposite in2="a2" operator="in" result="wide2"/>
    <feMerge><feMergeNode in="wide2"/><feMergeNode in="near"/><feMergeNode in="grained"/><feMergeNode in="darkEdge"/><feMergeNode in="lightEdge"/></feMerge>
  </filter>`;
}

function svgOf(name, a) {
  const r = rngFrom(a.seed);
  const list = a.draw(a.w, a.h, r);
  const defs = list.map((p, i) => filter(`c${i}`, a.seed + i * 7, { plain: p.plain, soft: p.soft })).join("");
  const groups = list.map((p, i) => {
    const slits = p.slits ? S(p.slits, TONE.moss).replace("/>", ` opacity="0.3"/>`) : "";
    const ribs = p.ribs ? S(p.ribs, p.ribFill) : "";
    return `<g filter="url(#c${i})">${S(p.d, p.fill)}${slits}${ribs}</g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${a.w}" height="${a.h}" viewBox="0 0 ${a.w} ${a.h}" style="display:block"><defs>${defs}</defs>${groups}</svg>`;
}

const only = process.argv[2];
mkdirSync("public/jungle", { recursive: true });
const browser = await chromium.launch({ args: ["--use-mock-keychain", "--password-store=basic"] });
let total = 0;
let smallTotal = 0;
for (const [name, a] of Object.entries(ASSETS)) {
  if (only && !name.includes(only)) continue;
  const page = await browser.newPage({ viewport: { width: a.w, height: a.h } });
  await page.setContent(`<!doctype html><body style="margin:0;background:transparent">${svgOf(name, a)}</body>`);
  const png = await page.screenshot({ omitBackground: true });
  await page.close();
  // The paper edge stays lossless: its paper must match the page's color exactly.
  const webp = name === "sheet-edge" ? { lossless: true, effort: 6 } : { quality: 66, alphaQuality: 80, effort: 6 };
  const out = await sharp(png).webp(webp).toFile(`public/jungle/${name}.webp`);
  total += out.size;
  // Phones get a lighter copy: they show these far smaller than a laptop does.
  const small = await sharp(png).resize({ width: Math.round(a.w * 0.55) }).webp(webp).toFile(`public/jungle/${name}-sm.webp`);
  smallTotal += small.size;
  console.log(`${name} ${a.w}x${a.h} ${Math.round(out.size / 1024)}KB`);
}
await browser.close();
console.log(`total ${Math.round(total / 1024)}KB, phone copies ${Math.round(smallTotal / 1024)}KB`);
