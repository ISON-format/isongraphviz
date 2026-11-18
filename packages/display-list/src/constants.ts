// src/constants.ts - the constants of design 2, 3, 4, 5 and 9. PROVISIONAL and UNMEASURED where the design says so; changing a normative
// constant is the next version of its format token (design 16).

export const DL_FORMAT = "igr-dl/1";
export const THEME_FORMAT = "igr-theme/1";
export const PICK_FORMAT = "igr-pick/1";
export const CV_FORMAT = "igr-cv/1";
export const XR_FORMAT = "igr-xr/1";

export const DEFAULT_DL_LIMITS = Object.freeze({ maxDlBytes: 67_108_864, maxDrawnLabelUnits: 1_048_576 } as const);
export const DEFAULT_DL_READ_LIMITS = Object.freeze({ maxBytes: 67_108_864, maxLineUnits: 16_777_216 } as const);
export const DEFAULT_CV_READ_LIMITS = Object.freeze({ maxBytes: 268_435_456, maxLineUnits: 16_777_216 } as const);

/** Every integer written to a display-list record satisfies |v| <= 2^40 milli-pixels (3.5). */
export const DL_COORD_MAX = 1_099_511_627_776;
/** The plan guard margin (7.3) and the readout domain (9.1), in milli-pixels. */
export const GUARD_MARGIN = 256_000;

// 30 section 4 constants, in pixels (adopted by reference, 3.1)
export const TRIM = 12;
export const DEGENERATE = 24;
export const LABEL_DY = 24;
export const ELABEL_DY = 4;
export const PAR_STEP = 16;
export const LOOP_END = 7;
export const NODE_LABEL_MAX_UNITS = 24;

/** The arrowhead (4.4(e)): 10 px behind the tip, 5 px to each side, in milli-pixels. */
export const ARROW_LEN = 10_000;
export const ARROW_HALF = 5_000;

/** The pick polyline has 16 sections (5.1) and an edge is picked within 6 px (5.2), in milli-pixels. */
export const PICK_SEG = 16;
export const EDGE_PICK_TOLERANCE = 6_000;
/** Element bounds (5.4), in milli-pixels. */
export const NODE_BOUND = 19_000;
export const EDGE_BOUND = 6_000;

/** The pointer and the backing store (5.2, 6.4). */
export const POINT_LIMIT = 2 ** 31;
export const VIEWPORT_MAX_PX = 16_384;
export const DPR_MIN_MILLI = 250;
export const DPR_MAX_MILLI = 8_000;
export const BACKING_AREA_MAX = 2 ** 26;

export const LIMIT_MAX = 2 ** 31;
