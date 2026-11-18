// src/constants.ts - the constants of igr-gl/1 (design 7.2, 7.3, 7.5). PROVISIONAL and UNMEASURED where the design says so; changing a normative constant
// is the next version of the format token (design 16).
export const GL_FORMAT = "igr-gl/1";
/** Sections of an edge strip (`2 * (GL_SEG + 1)` vertices) and of the pick polyline (display-list `PICK_SEG`). */
export const GL_SEG = 16;
/** A ceiling, not a guard (7.2): the whole plan, in bytes. PROVISIONAL, UNMEASURED. */
export const DEFAULT_GL_LIMITS = Object.freeze({ maxGlBytes: 268_435_456 } as const);

/** Instance strides in bytes (7.2) and the vertex count of each draw (7.4). */
export const STRIDE = Object.freeze({ arrow: 28, disc: 16, edge: 40 } as const);
export const VERTS = Object.freeze({ arrow: 3, disc: 4, edge: 2 * (GL_SEG + 1) } as const);
export const PROGRAMS = ["arrow", "disc", "edge"] as const;
export type GlProgram = (typeof PROGRAMS)[number];

/** Every number of a plan is below 2^24 and so exact in float32 (7.3 lemma). */
export const F32_EXACT = 16_777_216;
/** Node disc quad half-size (22 px) and edge box expansion (7.3 (N), (E)), in milli-pixels. */
export const NODE_EXPAND = 22_000;
export const EDGE_EXPAND = 12_000;

/** The program of each paint layer 1..7 (4.8, 7.2): edges 1-3, the arrow 4, discs 5-7. */
export const LAYER_PROGRAM: Readonly<Record<number, GlProgram>> = Object.freeze({ 1: "edge", 2: "edge", 3: "edge", 4: "arrow", 5: "disc", 6: "disc", 7: "disc" });
/** The `style` byte of an instance in a layer: edges 1 -> halo-sel 0, 2 -> halo-foc 1, 3 -> line 2; discs 5 -> ring-sel 0, 6 -> ring-foc 1, 7 -> disc 2. */
export const LAYER_STYLE: Readonly<Record<number, number>> = Object.freeze({ 1: 0, 2: 1, 3: 2, 5: 0, 6: 1, 7: 2 });
