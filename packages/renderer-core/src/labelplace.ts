// src/labelplace.ts - LP/1 deterministic label placement (design 37, DRAFT rev 3). One pure function; micro-pixel BigInt arithmetic.
import { floorDiv } from "./viewport.js";

/** Section 2: every drawn node (model node order) and every drawn label (node labels first, then edge labels), all in micro-pixels (1 px = 1,000,000). */
export interface PlaceLabelsInput {
  readonly nodes: ReadonlyArray<{ readonly cx: bigint; readonly cy: bigint }>;
  /** `units` is the UTF-16 length of the drawn text (>= 1); `(x, y)` is the DEFAULT baseline centre of the label. */
  readonly labels: ReadonlyArray<{ readonly kind: "node" | "edge"; readonly units: number; readonly x: bigint; readonly y: bigint }>;
}
/** Section 2: whole-pixel offset to add to the default position, one per input label, in the same order. */
export interface LabelPlacement { readonly dx: number; readonly dy: number }

const PX = 1_000_000n; // micro-pixels per pixel
const CELL = 64n * PX; // section 7: grid cell edge, 64 px
const HALF_UNIT = 4_500_000n; // section 4 (rev 3): half width of one UTF-16 unit, 4.5 px in micro-pixels

/** A closed integer rectangle in micro-pixels (section 4). */
interface Box { readonly l: bigint; readonly r: bigint; readonly t: bigint; readonly b: bigint }
/** A stored box; `mark` is the id of the last cost query that counted it, so a box that sits in several cells is counted once per query. */
class Stored implements Box {
  mark = 0;
  constructor(readonly l: bigint, readonly r: bigint, readonly t: bigint, readonly b: bigint) {}
}

/**
 * Section 5: the 29 candidates per kind, in the order tried. Horizontal offsets are in units of h (0, +1, -1), vertical offsets in px.
 * The first 11 are listed; then, for each d in a list, three candidates: node (0,d) (h,d+20) (-h,d+20); edge (0,d) (h,d) (-h,d).
 */
function table(first: ReadonlyArray<readonly [number, number]>, ds: readonly number[], shift: number): { dx: readonly number[]; dy: readonly number[] } {
  const dx: number[] = [], dy: number[] = [];
  for (const [x, y] of first) { dx.push(x); dy.push(y); }
  for (const d of ds) { dx.push(0, 1, -1); dy.push(d, d + shift, d + shift); }
  return { dx, dy };
}
const NODE = table([[0, 0], [0, -41], [1, -20], [-1, -20], [0, 14], [0, -55], [1, -34], [-1, -34], [1, -6], [-1, -6], [0, 28]], [-69, 42, -83, 56, -97, 70], 20);
const EDGE = table([[0, 0], [0, -14], [0, 18], [1, 0], [-1, 0], [0, -28], [0, 32], [1, -14], [-1, -14], [1, 18], [-1, 18]], [-42, 46, -56, 60, -70, 74], 0);
const NCAND = 29;

/**
 * One grid cell. `rel` holds four numbers per box (left, right, top, bottom) RELATIVE TO THE ORIGIN OF THIS CELL: every box in or next to the
 * cell is within a few cell widths (plus its own width) of the origin, far below 2^53 micro-pixels, so the numbers are exact integers and the
 * inner collision loop runs on plain doubles with the same result as the BigInt test of section 4.
 */
class Cell {
  readonly boxes: Stored[] = [];
  readonly rel: number[] = [];
}

/** Section 7: uniform grid of 64 px cells (integer floor of the box edges, floor division so negative values are right). */
class Grid {
  /** column -> row -> cell. Only looked up by key; never iterated, so Map order cannot affect a result. */
  private readonly cols = new Map<number, Map<number, Cell>>();
  /** Keys of the stored boxes: an identical box adds nothing to any collision test, so it is not stored twice (coincident nodes, labels piled on one default). Looked up only. */
  private readonly seen = new Set<string>();
  private stamp = 0;
  private static cell(v: bigint): number { return Number(floorDiv(v, CELL)); } // |v| <= 2^62 + small: the cell index is < 2^37, exact as a double

  /** A box is stored in every cell its closed extent touches. */
  add(box: Box): void {
    const key = `${box.l},${box.r},${box.t},${box.b}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    const stored = new Stored(box.l, box.r, box.t, box.b);
    const x0 = Grid.cell(box.l), x1 = Grid.cell(box.r), y0 = Grid.cell(box.t), y1 = Grid.cell(box.b);
    for (let cx = x0; cx <= x1; cx++) {
      let col = this.cols.get(cx);
      if (col === undefined) { col = new Map<number, Cell>(); this.cols.set(cx, col); }
      const ox = BigInt(cx) * CELL;
      for (let cy = y0; cy <= y1; cy++) {
        let cell = col.get(cy);
        if (cell === undefined) { cell = new Cell(); col.set(cy, cell); }
        const oy = BigInt(cy) * CELL;
        cell.boxes.push(stored);
        cell.rel.push(Number(box.l - ox), Number(box.r - ox), Number(box.t - oy), Number(box.b - oy));
      }
    }
  }

  /**
   * Walks the cells touched by `box` grown by 1 px on every side (a stored box at a gap of less than 1 px collides under section 4 yet may lie
   * in the neighbouring cell, so the plain touched cells would miss it; every colliding box shares a cell with the grown extent, hence the result
   * equals the all-pairs rule). `visit(stored)` is called for every stored box that collides (a box in several cells may be visited repeatedly)
   * and returns true to stop the walk.
   */
  private walk(box: Box, visit: (s: Stored) => boolean): void {
    const x0 = Grid.cell(box.l - PX), x1 = Grid.cell(box.r + PX), y0 = Grid.cell(box.t - PX), y1 = Grid.cell(box.b + PX);
    const M = 1_000_000, W = 64_000_000; // the 1 px gap of section 4 and the cell edge, in micro-pixels, as doubles
    const ox0 = BigInt(x0) * CELL, oy0 = BigInt(y0) * CELL; // the query box relative to the origin of its first cell, converted once (exact: a few cells plus the box width)
    const bl = Number(box.l - ox0), br = Number(box.r - ox0), bt = Number(box.t - oy0), bb = Number(box.b - oy0);
    for (let cx = x0; cx <= x1; cx++) {
      const col = this.cols.get(cx);
      if (col === undefined) continue;
      const ql = bl - (cx - x0) * W, qr = br - (cx - x0) * W;
      for (let cy = y0; cy <= y1; cy++) {
        const cell = col.get(cy);
        if (cell === undefined) continue;
        const qt = bt - (cy - y0) * W, qb = bb - (cy - y0) * W;
        const rel = cell.rel, boxes = cell.boxes;
        for (let i = 0, j = 0; i < boxes.length; i++, j += 4) {
          // section 4: a.left < b.right + 1px and b.left < a.right + 1px and a.top < b.bottom + 1px and b.top < a.bottom + 1px
          if (ql < rel[j + 1]! + M && rel[j]! < qr + M && qt < rel[j + 3]! + M && rel[j + 2]! < qb + M && visit(boxes[i]!)) return;
        }
      }
    }
  }

  /** True iff `box` collides with a stored box. */
  hits(box: Box): boolean {
    let found = false;
    this.walk(box, () => (found = true));
    return found;
  }

  /**
   * Section 6 (rev 2): the number of DISTINCT stored boxes (identical edges are stored once) that `box` collides with, once per box however many
   * cells hold it; the count stops as soon as it reaches `limit` (the result is then >= limit, which is all a caller that only wants a smaller
   * cost needs). Same region and same collision test as `walk`, written out without a callback because this loop is the hot one in dense layouts.
   */
  cost(box: Box, limit: number): number {
    const q = ++this.stamp;
    let n = 0;
    const x0 = Grid.cell(box.l - PX), x1 = Grid.cell(box.r + PX), y0 = Grid.cell(box.t - PX), y1 = Grid.cell(box.b + PX);
    const M = 1_000_000, W = 64_000_000; // the 1 px gap and the cell edge, in micro-pixels, as doubles
    const ox0 = BigInt(x0) * CELL, oy0 = BigInt(y0) * CELL; // the query box relative to the origin of its first cell, converted once (exact: a few cells plus the box width)
    const bl = Number(box.l - ox0), br = Number(box.r - ox0), bt = Number(box.t - oy0), bb = Number(box.b - oy0);
    for (let cx = x0; cx <= x1; cx++) {
      const col = this.cols.get(cx);
      if (col === undefined) continue;
      const ql = bl - (cx - x0) * W, qr = br - (cx - x0) * W;
      for (let cy = y0; cy <= y1; cy++) {
        const cell = col.get(cy);
        if (cell === undefined) continue;
        const qt = bt - (cy - y0) * W, qb = bb - (cy - y0) * W;
        const rel = cell.rel, boxes = cell.boxes;
        for (let i = 0, j = 0; i < boxes.length; i++, j += 4) {
          if (ql < rel[j + 1]! + M && rel[j]! < qr + M && qt < rel[j + 3]! + M && rel[j + 2]! < qb + M) {
            const s = boxes[i]!;
            if (s.mark !== q) { s.mark = q; if (++n >= limit) return n; }
          }
        }
      }
    }
    return n;
  }
}

/**
 * Section 6: for each label in order, the first of its 29 candidates (section 5) whose box collides with no drawn node box and no
 * already placed label box; if none is free, the first candidate with the fewest collisions (distinct colliding boxes, rev 2).
 * The chosen box is recorded for the labels after it. Pure, total and deterministic; the input is not modified.
 * Offsets are whole pixels (the box dimensions are whole pixels).
 */
export function placeLabels(input: PlaceLabelsInput): LabelPlacement[] {
  const grid = new Grid();
  for (const n of input.nodes) grid.add({ l: n.cx - 13n * PX, r: n.cx + 13n * PX, t: n.cy - 13n * PX, b: n.cy + 13n * PX }); // section 4: 26 px square
  const out: LabelPlacement[] = [];
  for (const lab of input.labels) {
    const half = HALF_UNIT * BigInt(lab.units); // section 4: half width 4.5u px (width 9u px, always an integer number of micro-pixels)
    const isNode = lab.kind === "node";
    const h0 = Math.floor((9 * lab.units + 1) / 2); // section 5: ceil(9u / 2), a whole number of pixels
    const h = isNode ? h0 + 14 : h0 + 10;
    const dxs = isNode ? NODE.dx : EDGE.dx, dys = isNode ? NODE.dy : EDGE.dy;
    const boxOf = (k: number): Box => {
      const X = lab.x + BigInt(dxs[k]! * h) * PX, Y = lab.y + BigInt(dys[k]!) * PX;
      return { l: X - half, r: X + half, t: Y - 10n * PX, b: Y + 3n * PX };
    };
    let pick = -1;
    for (let k = 0; k < NCAND; k++) if (!grid.hits(boxOf(k))) { pick = k; break; } // first free candidate
    if (pick < 0) { // section 6 (rev 2): none free; the first candidate with the least number of distinct colliding boxes
      // The candidates are examined from the last to the first (the far ones are usually the cheapest, so the bound drops early); the result is the
      // same as examining them in order: a candidate wins iff its cost is smaller, or equal with a smaller index. The count of a candidate stops
      // as soon as it can no longer win (it needs a cost of at most `best` because every index examined later is smaller than the current pick).
      let best = Infinity;
      for (let k = NCAND - 1; k >= 0; k--) {
        const c = grid.cost(boxOf(k), best === Infinity ? best : best + 1);
        if (c <= best) { best = c; pick = k; }
      }
    }
    grid.add(boxOf(pick));
    const cdx = dxs[pick]! * h;
    out.push({ dx: cdx === 0 ? 0 : cdx, dy: dys[pick]! }); // `cdx === 0 ? 0` keeps -0 out of the result
  }
  return out;
}
