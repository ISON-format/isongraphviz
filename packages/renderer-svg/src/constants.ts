// src/constants.ts - section 4 constants and the fixed theme (5.4). PROVISIONAL and UNMEASURED; changing one is igr-svg/2.

export const SVG_FORMAT = "igr-svg/1";

export const DEFAULT_SVG_LIMITS = Object.freeze({ maxSvgBytes: 67_108_864, maxDrawnLabelUnits: 1_048_576 } as const);
export const DEFAULT_READ_LIMITS = Object.freeze({ maxBytes: 67_108_864, maxLineUnits: 16_777_216, maxIdHexDigits: 4_194_304 } as const);

export const NODE_R = 10;
export const RING_SEL = 14;
export const RING_FOC = 18;
export const TRIM = 12;
export const DEGENERATE = 24;
export const LABEL_DY = 24;
export const ELABEL_DY = 4;
export const PAR_STEP = 16;
export const LOOP_END = 7;
export const PICK_W = 10;

/** The 19 lines of the fixed theme (5.4), nothing graph-derived. */
export const THEME_LINES: readonly string[] = Object.freeze([
  ".igr-svg{font:12px sans-serif}",
  ".igr-shape{stroke:#fff;stroke-width:2}",
  ".igr-k0 .igr-shape{fill:#2a78d6}",
  ".igr-k1 .igr-shape{fill:#eb6834}",
  ".igr-k2 .igr-shape{fill:#1baf7a}",
  ".igr-k3 .igr-shape{fill:#eda100}",
  ".igr-k4 .igr-shape{fill:#e87ba4}",
  ".igr-k5 .igr-shape{fill:#008300}",
  ".igr-k6 .igr-shape{fill:#4a3aa7}",
  ".igr-k7 .igr-shape{fill:#e34948}",
  ".igr-kx .igr-shape{fill:#7a7975}",
  ".igr-line{fill:none;stroke:currentColor;stroke-opacity:.6;stroke-width:2}",
  ".igr-pick{fill:none;stroke:transparent;stroke-width:10;pointer-events:stroke}",
  ".igr-arrow{fill:currentColor;fill-opacity:.6}",
  ".igr-ring-sel{fill:none;stroke:currentColor;stroke-width:3}",
  ".igr-ring-foc{fill:none;stroke:currentColor;stroke-width:2;stroke-dasharray:4 3}",
  ".igr-halo-sel{fill:none;stroke:currentColor;stroke-width:6;stroke-opacity:.35}",
  ".igr-halo-foc{fill:none;stroke:currentColor;stroke-width:10;stroke-opacity:.25;stroke-dasharray:6 4}",
  ".igr-label,.igr-elabel{fill:currentColor;unicode-bidi:isolate;pointer-events:none}",
]);

export const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';
