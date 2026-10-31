/* eslint-disable @next/next/no-img-element -- decorative, already-sized cut-outs; next/image would only re-encode them */
import { JungleParallax } from "@/components/jungle/jungle-parallax";

// The home page's paper jungle (Justin: Paper Mario's look, minus the Mario).
// Every plant is a baked image from scripts/make-jungle.mjs: far treelines and
// redwoods behind the logo, shrubs and ferns beside it, big leaves in front,
// all of it decorative and untouchable. Sizes and places live in app/globals.css.

const SIZES: Record<string, [number, number]> = {
  "treeline-far": [2400, 620],
  "treeline-mid": [2400, 560],
  "redwood-a": [760, 1500],
  "redwood-b": [460, 1500],
  "fern-a": [820, 540],
  "fern-b": [700, 460],
  "fern-c": [700, 460],
  "shrub-a": [780, 460],
  "shrub-b": [640, 380],
  "palm-a": [900, 1000],
  "palm-b": [760, 840],
  "palm-c": [760, 840],
  "fern-d": [700, 460],
  "vine-a": [420, 860],
  "hill-deep": [2400, 300],
  "hill-night": [2400, 220],
  "sheet-edge": [2400, 220],
};

function Cut({ name, spot, lazy = false }: { name: string; spot: string; lazy?: boolean }) {
  const [width, height] = SIZES[name];
  return (
    <img
      src={`/jungle/${name}.webp`}
      width={width}
      height={height}
      alt=""
      draggable={false}
      decoding="async"
      loading={lazy ? "lazy" : undefined}
      className={`jungle-cut jungle-cut--${spot}`}
    />
  );
}

function Layer({ depth, px, children }: { depth: number; px: number; children: React.ReactNode }) {
  return (
    <div data-depth={depth} data-px={px} className="jungle-layer">
      {children}
    </div>
  );
}

/** Everything behind the logo, far to near. */
export function JungleStage() {
  return (
    <div aria-hidden="true" className="jungle-stage">
      <JungleParallax />
      <Layer depth={0.5} px={-4}>
        <Cut name="treeline-far" spot="far" />
      </Layer>
      <Layer depth={0.4} px={-8}>
        <Cut name="redwood-b" spot="redwood-1" />
        <Cut name="redwood-b" spot="redwood-2" />
        <Cut name="redwood-b" spot="redwood-5" lazy />
      </Layer>
      <Layer depth={0.3} px={-12}>
        <Cut name="treeline-mid" spot="mid" />
        <Cut name="redwood-a" spot="redwood-3" lazy />
        <Cut name="redwood-a" spot="redwood-4" lazy />
      </Layer>
      <Layer depth={0.14} px={-20}>
        <Cut name="shrub-a" spot="shrub-left" />
        <Cut name="fern-b" spot="fern-right" />
        <Cut name="vine-a" spot="vine" />
      </Layer>
    </div>
  );
}

/**
 * In front of the logo: big plants tucked behind a dark hill and the page's own
 * paper edge, so as the sheet slides up nothing but its cut edge ever shows a
 * bottom. They sit under .jungle-paper, which hides their stems.
 */
export function JungleFront() {
  return (
    <div aria-hidden="true" className="jungle-front">
      <Layer depth={-0.05} px={-30}>
        <Cut name="palm-b" spot="palm-left-back" />
        <Cut name="fern-a" spot="fern-seam-right" />
      </Layer>
      <Layer depth={-0.12} px={-46}>
        <Cut name="palm-a" spot="palm-right" />
        <Cut name="fern-c" spot="fern-seam-left" />
      </Layer>
      <Cut name="hill-night" spot="front-hill" />
      <Cut name="sheet-edge" spot="edge" />
    </div>
  );
}

/** Plants reaching in from the screen's edges beside the content, on wide screens only. */
export function JungleMargins() {
  const plants: Array<[name: string, width: number, height: number, depth: number]> = [
    ["palm-c", 760, 840, -0.08],
    ["fern-d", 700, 460, 0.06],
    ["palm-c", 760, 840, -0.05],
  ];
  return (
    <div aria-hidden="true" className="jungle-margins">
      {plants.map(([name, width, height, depth], i) => (
        <div key={i} className={`jungle-margin jungle-margin--${i + 1}`}>
          <div data-depth={depth} data-px={-8} data-self="" className="jungle-margin__drift">
            <img src={`/jungle/${name}.webp`} width={width} height={height} alt="" loading="lazy" decoding="async" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The page ends back in the undergrowth. */
export function JungleFooter() {
  return (
    <div aria-hidden="true" className="jungle-footer">
      <div className="jungle-layer" data-depth={0.1} data-px={-6} data-self="">
        <Cut name="treeline-mid" spot="footer-far" lazy />
      </div>
      <div className="jungle-layer" data-depth={0.05} data-px={-12} data-self="">
        <Cut name="shrub-a" spot="footer-shrub" lazy />
        <Cut name="fern-a" spot="footer-fern-right" lazy />
        <Cut name="hill-deep" spot="footer-hill" lazy />
      </div>
      <div className="jungle-layer" data-depth={-0.04} data-px={-22} data-self="">
        <Cut name="fern-c" spot="footer-fern-left" lazy />
        <Cut name="shrub-b" spot="footer-shrub-near" lazy />
        <Cut name="hill-night" spot="footer-ground" lazy />
      </div>
    </div>
  );
}
