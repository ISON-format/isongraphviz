// Label placement LP/1 (design 37, DRAFT rev 3: 9 px per UTF-16 unit, 29 candidates, fewest-collisions fallback): hand-computed cases, grid == all-pairs on seeded random inputs, near-linear performance.
import { describe, expect, it } from "vitest";
import * as api from "../src/index.js";
import { placeLabels } from "../src/labelplace.js";
import type { LabelPlacement, PlaceLabelsInput } from "../src/labelplace.js";

const P = 1_000_000n; // micro-pixels per pixel (design 37 section 2)
/** Pixels (a double that is exact in micro-pixels, such as 50.5) to micro-pixels. */
const px = (v: number): bigint => BigInt(Math.round(v * 1e6));

type Lab = PlaceLabelsInput["labels"][number];
const nodeLabel = (units: number, x: number, y: number): Lab => ({ kind: "node", units, x: px(x), y: px(y) });
const edgeLabel = (units: number, x: number, y: number): Lab => ({ kind: "edge", units, x: px(x), y: px(y) });
const nodes = (...pts: Array<[number, number]>): PlaceLabelsInput["nodes"] => pts.map(([x, y]) => ({ cx: px(x), cy: px(y) }));
const run = (n: PlaceLabelsInput["nodes"], l: Lab[]): Array<[number, number]> => placeLabels({ nodes: n, labels: l }).map((r) => [r.dx, r.dy]);

// ---------------------------------------------------------------------------------------------------------------------------------
// The ALL-PAIRS reference: a literal reading of sections 4 to 6 (rev 3), with no grid. Boxes are closed rectangles in micro-pixels.
// ---------------------------------------------------------------------------------------------------------------------------------
interface RBox { left: bigint; right: bigint; top: bigint; bottom: bigint }
const labelBox = (X: bigint, Y: bigint, u: number): RBox => ({ left: X - 4_500_000n * BigInt(u), right: X + 4_500_000n * BigInt(u), top: Y - 10n * P, bottom: Y + 3n * P });
const nodeBox = (cx: bigint, cy: bigint): RBox => ({ left: cx - 13n * P, right: cx + 13n * P, top: cy - 13n * P, bottom: cy + 13n * P });
const collide = (a: RBox, b: RBox): boolean => a.left < b.right + P && b.left < a.right + P && a.top < b.bottom + P && b.top < a.bottom + P;
function candidates(kind: "node" | "edge", u: number): Array<[number, number]> {
  const h0 = Math.floor((9 * u + 1) / 2); // ceil(9u/2)
  if (kind === "node") {
    const h = h0 + 14;
    const out: Array<[number, number]> = [[0, 0], [0, -41], [h, -20], [-h, -20], [0, 14], [0, -55], [h, -34], [-h, -34], [h, -6], [-h, -6], [0, 28]];
    for (const d of [-69, 42, -83, 56, -97, 70]) out.push([0, d], [h, d + 20], [-h, d + 20]);
    return out;
  }
  const h = h0 + 10;
  const out: Array<[number, number]> = [[0, 0], [0, -14], [0, 18], [h, 0], [-h, 0], [0, -28], [0, 32], [h, -14], [-h, -14], [h, 18], [-h, 18]];
  for (const d of [-42, 46, -56, 60, -70, 74]) out.push([0, d], [h, d], [-h, d]);
  return out;
}
/** Section 6 (rev 3) read literally: cost = number of DISTINCT (identical l, r, t, b count once) colliding boxes; the first candidate with the least cost wins (cost 0 = free). */
function allPairs(input: PlaceLabelsInput, stats?: { fallbacks: number }): Array<{ dx: number; dy: number }> {
  const obstacles: RBox[] = input.nodes.map((n) => nodeBox(n.cx, n.cy));
  const out: Array<{ dx: number; dy: number }> = [];
  for (const lab of input.labels) {
    const cands = candidates(lab.kind, lab.units);
    const boxes = cands.map(([dx, dy]) => labelBox(lab.x + BigInt(dx) * P, lab.y + BigInt(dy) * P, lab.units));
    const costs = boxes.map((box) => {
      const keys = new Set<string>();
      for (const o of obstacles) if (collide(box, o)) keys.add(`${o.left},${o.right},${o.top},${o.bottom}`);
      return keys.size;
    });
    const best = Math.min(...costs);
    const k = costs.indexOf(best);
    if (best > 0 && stats !== undefined) stats.fallbacks++;
    obstacles.push(boxes[k]!);
    out.push({ dx: cands[k]![0], dy: cands[k]![1] });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Hand-computed cases (rev 3: half width 4.5u, h = ceil(4.5u) + 14 / + 10; the vertical blocker windows are those of rev 1). Node-label scenes: the owner node is at (0, 0), its label u = 1 at the default (0, 24) (box x -4.5..4.5, y 14..27; h = ceil(4.5) + 14 = 19).
// A blocker node at (bx, by) collides with the candidate (ox, oy) iff |bx - ox| < 18.5 (= 4.5u + 14) and oy < by < oy + 41 (section 4 worked out by hand);
// the candidate columns are ox = 0, +19, -19, so blockers sit at bx = 0, +19, -19.
// ---------------------------------------------------------------------------------------------------------------------------------
const A: [number, number] = [0, 10], B: [number, number] = [0, -10], C: [number, number] = [19, -10], C2: [number, number] = [19, 10];
const D: [number, number] = [-19, -10], D2: [number, number] = [-19, 10], E: [number, number] = [0, 24], F: [number, number] = [0, -45];
const G: [number, number] = [19, -24], H: [number, number] = [19, 4], H2: [number, number] = [-19, 4], Z: [number, number] = [0, 40];
const NODE_CAND: Array<[number, number]> = [[0, 0], [0, -41], [19, -20], [-19, -20], [0, 14], [0, -55], [19, -34], [-19, -34], [19, -6], [-19, -6], [0, 28]];

interface Case { name: string; nodes: Array<[number, number]>; labels: Lab[]; expect: Array<[number, number]> }
const ownerScene = (blockers: Array<[number, number]>): { nodes: Array<[number, number]>; labels: Lab[] } => ({ nodes: [[0, 0], ...blockers], labels: [nodeLabel(1, 0, 24)] });
const nodeForced: Array<[number, Array<[number, number]>]> = [
  [0, []], [1, [A]], [2, [A, B]], [3, [A, B, C]], [4, [A, B, C, D]], [5, [A, B, C, D, E]], [6, [A, B, C2, D, E, F]],
  [7, [A, B, C2, D2, E, F, G]], [8, [A, B, C, D, E, F]], [9, [A, B, H, D, E, F]], [10, [A, B, E, F, H, H2]],
];
const cases: Case[] = [];
for (const [k, bl] of nodeForced) cases.push({ name: `node label: candidate ${k + 1} of 29 is the first free one (section 5 order)`, ...ownerScene(bl), expect: [NODE_CAND[k]!] });
// The rev 1 'all 11 blocked' set: candidates 12 (0,-69) is blocked by F (0,-45) (-69 < -45 < -28), candidate 13 = (h, -49) is not blocked by H (19,4) (-49 < 4 < -8 is false) -> (19, -49).
cases.push({ name: "node label: the first 11 candidates blocked, candidate 12 blocked by F, candidate 13 (19, -49) is free", ...ownerScene([A, B, E, F, H, H2, Z]), expect: [[19, -49]] });

// Edge-label scenes (rev 3): label u = 1 at the default (0, 0) (box x -4.5..4.5, y -10..3, h = ceil(4.5) + 10 = 15). A blocker node (bx, by) collides with (ox, oy) iff |bx - ox| < 18.5 and by - 17 < oy < by + 24.
const EDGE_CAND: Array<[number, number]> = [[0, 0], [0, -14], [0, 18], [15, 0], [-15, 0], [0, -28], [0, 32], [15, -14], [-15, -14], [15, 18], [-15, 18]];
const edgeForced: Array<[number, Array<[number, number]>]> = [
  [0, []], [1, [[0, 10]]], [2, [[0, -10]]], [3, [[-10, 0]]], [4, [[10, 0]]], [5, [[0, 0]]], [6, [[0, 0], [0, -30]]],
  [7, [[-10, 0], [-10, -20], [-10, 25], [20, 10]]], [8, [[10, 0], [10, -20], [10, 25], [-20, 10]]],
  [9, [[-10, 0], [-10, -20], [-10, 25], [20, -10]]], [10, [[10, 0], [10, -20], [10, 25], [-20, -10]]],
];
for (const [k, bl] of edgeForced) cases.push({ name: `edge label: candidate ${k + 1} of 29 is the first free one (section 5 order)`, nodes: bl, labels: [edgeLabel(1, 0, 0)], expect: [EDGE_CAND[k]!] });
// The rev 1 'all 11 blocked' set (0,0), (0,-30), (0,25): windows (by-17, by+24) = (-17,24), (-47,-6), (8,49) cover oy -42 (cands 12-14) and 46 (cands 15-17) but not -56: candidate 18 = (0, -56).
cases.push({ name: "edge label: the first 17 candidates blocked by three nodes, candidate 18 (0, -56) is free", nodes: [[0, 0], [0, -30], [0, 25]], labels: [edgeLabel(1, 0, 0)], expect: [[0, -56]] });

// ---- rev 2 additions are appended after the width cases (see below)
// Widths (rev 3): node label, blockers A and B only; candidate 2 = (h, -20), h = ceil(4.5u) + 14, is free because |0 - h| >= 4.5u + 14 (on the boundary for even u, 0.5 px beyond it for odd u; a floor would collide).
const nodeH: Array<[number, number]> = [[1, 19], [2, 23], [3, 28], [5, 37], [7, 46], [10, 59], [100, 464]];
for (const [u, h] of nodeH) cases.push({ name: `node label units ${u}: h = ceil(9u/2) + 14 = ${h}, candidate 2 free (offset ${h}, -20)`, nodes: [[0, 0], A, B], labels: [nodeLabel(u, 0, 24)], expect: [[h, -20]] });
// Edge labels: node (-10, 0) blocks candidates 1, 2, 3 (|-10 - 0| < 4.5u + 14; window -17..24 covers dy 0, -14, 18) and not candidate 4 (|-10 - h| >= 4.5u + 14).
const edgeH: Array<[number, number]> = [[1, 15], [2, 19], [3, 24], [5, 33], [7, 42]];
for (const [u, h] of edgeH) cases.push({ name: `edge label units ${u}: h = ceil(9u/2) + 10 = ${h}, candidate 4 is (${h}, 0)`, nodes: [[-10, 0]], labels: [edgeLabel(u, 0, 0)], expect: [[h, 0]] });
cases.push({ name: "edge label units 100 (width 900 px) is blocked by a node 300 px away and shifts by h = 450 + 10 = 460", nodes: [[300, -5]], labels: [edgeLabel(100, 0, 0)], expect: [[-460, 0]] });

// The 1 px gap on every side and corner (edge label u = 1, half width 4.5, h = 15; node at (0,0): box -13..13; label box X-4.5..X+4.5, Y-10..Y+3).
const eps = 1n; // one micro-pixel
const gapCase = (name: string, units: number, x: bigint, y: bigint, expectOne: [number, number], nd: [number, number] = [0, 0]): void => {
  cases.push({ name, nodes: [nd], labels: [{ kind: "edge", units, x, y }], expect: [expectOne] });
};
gapCase("gap right: label left edge (X - 4.5) exactly 1 px from the node box (X = 18.5) -> free", 1, px(18.5), 0n, [0, 0]);
gapCase("gap right minus 1 micro-pixel -> collides, candidates 1 and 2 collide, candidate 4 (15, 0)", 1, px(18.5) - eps, 0n, [15, 0]);
gapCase("gap left: label right edge exactly 1 px from the node box (X = -18.5) -> free", 1, px(-18.5), 0n, [0, 0]);
gapCase("gap left plus 1 micro-pixel -> collides, candidate 4 (15, 0) still collides, candidate 5 (-15, 0)", 1, px(-18.5) + eps, 0n, [-15, 0]);
gapCase("gap below: label top exactly 1 px below the node box -> free", 1, 0n, px(24), [0, 0]);
gapCase("gap below minus 1 micro-pixel -> collides, candidate 2 (0, 18)", 1, 0n, px(24) - eps, [0, 18]);
gapCase("gap above: label bottom exactly 1 px above the node box -> free", 1, 0n, px(-17), [0, 0]);
gapCase("gap above plus 1 micro-pixel -> collides, candidate 1 (0, -14)", 1, 0n, px(-17) + eps, [0, -14]);
gapCase("corner exactly 1 px on both axes -> free", 1, px(18.5), px(24), [0, 0]);
gapCase("corner short by 1 micro-pixel on both axes -> collides, candidate 2 (0, 18)", 1, px(18.5) - eps, px(24) - eps, [0, 18]);
gapCase("corner short on x only, exactly 1 px on y -> free", 1, px(18.5) - eps, px(24), [0, 0]);
gapCase("corner short on y only, exactly 1 px on x -> free", 1, px(18.5), px(24) - eps, [0, 0]);
gapCase("odd u = 3 (half width 13.5): X = 27.5 gives an exact 1 px gap on the right -> free", 3, px(27.5), 0n, [0, 0]);
gapCase("odd u = 3: X = 27.5 minus 1 micro-pixel collides; h = ceil(13.5) + 10 = 24, candidate 4 (24, 0)", 3, px(27.5) - eps, 0n, [24, 0]);
gapCase("odd u = 3: X = -27.5 exact 1 px gap on the left -> free", 3, px(-27.5), 0n, [0, 0]);
gapCase("odd u = 3: X = -27.5 plus 1 micro-pixel collides; candidate 4 (24, 0) still collides, candidate 5 (-24, 0)", 3, px(-27.5) + eps, 0n, [-24, 0]);
gapCase("odd u = 5 (half width 22.5): X = 36.5 exact gap -> free", 5, px(36.5), 0n, [0, 0]);
gapCase("odd u = 5: X = 36.5 minus 1 micro-pixel collides; h = 23 + 10 = 33, candidate 4 (33, 0)", 5, px(36.5) - eps, 0n, [33, 0]);
gapCase("even u = 2 (half width 9): X = 23 exact gap -> free", 2, px(23), 0n, [0, 0]);
gapCase("even u = 2: X = 23 minus 1 micro-pixel collides; h = 9 + 10 = 19, candidate 4 (19, 0)", 2, px(23) - eps, 0n, [19, 0]);
gapCase("fractional micro-pixels: node at 0.5 px, label X = 19 px - 1 micro-pixel, gap just under 1 px -> collides, candidate 4 (15, 0)", 1, px(19) - eps, 0n, [15, 0], [0.5, 0]);
gapCase("label crosses a 64 px grid line; the node box ends at 63.5 px, label left edge at 64 px (gap 0.5 px across a cell boundary) -> collides", 1, px(68.5), 0n, [15, 0], [50.5, 0]);
gapCase("same scene with gap exactly 1 px across the cell boundary (label left edge at 64.5 px) -> free", 1, px(69), 0n, [0, 0], [50.5, 0]);
gapCase("same scene with gap 1 px minus 1 micro-pixel across the cell boundary -> collides", 1, px(69) - eps, 0n, [15, 0], [50.5, 0]);
gapCase("negative cell line: node box ends at -64.5 px, label left edge at -64 px (gap 0.5 px) -> collides, candidate 4 (15, 0)", 1, px(-59.5), 0n, [15, 0], [-77.5, 0]);
gapCase("negative cell line: node box ends at -65 px, label left edge at -64 px (gap exactly 1 px) -> free", 1, px(-59.5), 0n, [0, 0], [-78, 0]);

// ---------------------------------------------------------------------------------------------------------------------------------
// Rev 2: candidates 12..29 forced one by one. Candidate tables are written out by hand from section 5 (1-based index = array index + 1).
// Node labels: a blocker (bx, by) at the x of a candidate column (0, +h, -h) blocks (ox, oy) iff |bx - ox| < 4.5u + 14 <= h (so only its own column) and oy < by < oy + 41:
//   an earlier candidate (ox, v) is blocked by the node (ox, v + 1) (window v-39..v), or by (ox, v + 40) (window v..v+39) when it lies BELOW the target in its own column (v > target oy), which keeps the target free.
// Edge labels: blocker (bx, by) blocks (ox, oy) iff |bx - ox| < 4.5u + 14 and by - 17 < oy < by + 24; columns are isolated with bx = +-(h + 10) (own column only), and the column 0 with bx = -+10 (column 0 and one side); the vertical rule is the same trick: by = v - 23 (window v-39..v) or v + 16 (window v..v+39).
type Cand = [number, number];
const nodeTable = (h: number): Cand[] => [[0, 0], [0, -41], [h, -20], [-h, -20], [0, 14], [0, -55], [h, -34], [-h, -34], [h, -6], [-h, -6], [0, 28],
  [0, -69], [h, -49], [-h, -49], [0, 42], [h, 62], [-h, 62], [0, -83], [h, -63], [-h, -63], [0, 56], [h, 76], [-h, 76], [0, -97], [h, -77], [-h, -77], [0, 70], [h, 90], [-h, 90]];
const edgeTable = (h: number): Cand[] => [[0, 0], [0, -14], [0, 18], [h, 0], [-h, 0], [0, -28], [0, 32], [h, -14], [-h, -14], [h, 18], [-h, 18],
  [0, -42], [h, -42], [-h, -42], [0, 46], [h, 46], [-h, 46], [0, -56], [h, -56], [-h, -56], [0, 60], [h, 60], [-h, 60], [0, -70], [h, -70], [-h, -70], [0, 74], [h, 74], [-h, 74]];
const nodeBlockers = (tab: Cand[], t: number): Array<[number, number]> => {
  const out: Array<[number, number]> = [];
  for (let j = 0; j < t; j++) { const [ox, v] = tab[j]!; const sameCol = Math.sign(ox) === Math.sign(tab[t]![0]); out.push([ox, sameCol && v > tab[t]![1] ? v + 40 : v + 1]); }
  return out;
};
const edgeBlockers = (tab: Cand[], t: number, h: number): Array<[number, number]> => {
  const out: Array<[number, number]> = [];
  const tc = Math.sign(tab[t]![0]);
  for (let j = 0; j < t; j++) {
    const [ox, v] = tab[j]!; const c = Math.sign(ox);
    const bx = c === 1 ? h + 10 : c === -1 ? -(h + 10) : tc === 1 ? -10 : 10; // never blocks the target column except the own column
    const ownBlocks = c === tc; // this blocker's x window reaches the target's column
    out.push([bx, ownBlocks && v > tab[t]![1] ? v + 16 : v - 23]);
  }
  return out;
};
for (const [u, h, targets] of [[1, 19, [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29]], [3, 28, [13, 26]], [2, 23, [20, 29]]] as Array<[number, number, number[]]>) {
  for (const n of targets) {
    const tab = nodeTable(h);
    cases.push({ name: `node label u=${u} (h=${h}): candidate ${n} of 29 = (${tab[n - 1]![0]}, ${tab[n - 1]![1]}) is the first free one`, nodes: [[0, 0], ...nodeBlockers(tab, n - 1)], labels: [nodeLabel(u, 0, 24)], expect: [tab[n - 1]!] });
  }
}
for (const [u, h, targets] of [[1, 15, [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29]], [3, 24, [13, 26]], [2, 19, [20, 29]]] as Array<[number, number, number[]]>) {
  for (const n of targets) {
    const tab = edgeTable(h);
    cases.push({ name: `edge label u=${u} (h=${h}): candidate ${n} of 29 = (${tab[n - 1]![0]}, ${tab[n - 1]![1]}) is the first free one`, nodes: edgeBlockers(tab, n - 1, h), labels: [edgeLabel(u, 0, 0)], expect: [tab[n - 1]!] });
  }
}

// Rev 2 fallback (section 6): no candidate is free; cost = number of DISTINCT colliding boxes; the first candidate with the least cost wins.
// Node-label scenes: owner (0,0), label u = 1 at (0, 24), h = 19; a node (bx, by) in the column of an offset blocks the oys in (by - 41, by) exclusive of the ends.
// COVER blocks all 29 candidates exactly once: column 0 (oys -97 -83 -69 | -55 -41 | 0 14 28 | 42 56 70) by (0,-57) (0,-16) (0,39) (0,71); column +19 and -19 (oys -77 -63 -49 | -34 -20 -6 | 62 76 90) by (+-19,-37) (+-19,6) (+-19,95).
const COVER: Array<[number, number]> = [[0, -57], [0, -16], [0, 39], [0, 71], [19, -37], [19, 6], [19, 95], [-19, -37], [-19, 6], [-19, 95]];
cases.push({ name: "fallback: all 29 candidates cost 1 -> tie -> the first candidate, (0, 0)", ...ownerScene(COVER), expect: [[0, 0]] });
// + (0,5): window oys -35..4 holds 0 only: candidate 1 costs 2, candidate 2 (0,-41) costs 1 -> the second candidate wins (not the first).
cases.push({ name: "fallback: candidate 1 costs 2, candidate 2 costs 1 -> (0, -41) (min cost is not the first)", ...ownerScene([...COVER, [0, 5]]), expect: [[0, -41]] });
// + (0,20) covers oy 0 and 14 (cands 1, 5), + (0,-20) covers -55 and -41 (cands 6, 2), + (19,10) covers -20 and -6 of column +19 (cands 3, 9) and (-19,10) likewise (cands 4, 10):
// costs: cands 1..6 = 2 each, cand 7 = (19,-34) = 1 (cand 8 = 1 too, a later tie) -> candidate 7 wins (not the first, not the last, ties go to the earliest).
cases.push({ name: "fallback: candidates 1..6 cost 2, candidates 7 and 8 cost 1 -> (19, -34) (middle, tie goes to the earlier)", ...ownerScene([...COVER, [0, 20], [0, -20], [19, 10], [-19, 10]]), expect: [[19, -34]] });
// A second cover with different edges: every candidate costs 2 except candidate 29 = (-19, 90), which only (-19,95) reaches ((-19,80) covers 62 and 76 but not 90) -> the last candidate wins.
const COVER2: Array<[number, number]> = [[0, -58], [0, -17], [0, 38], [0, 72], [19, -38], [19, 5], [19, 94], [-19, -38], [-19, 5], [-19, 80]];
cases.push({ name: "fallback: candidates 1..28 cost 2, candidate 29 costs 1 -> (-19, 90) (min cost is the last)", ...ownerScene([...COVER, ...COVER2]), expect: [[-19, 90]] });
// Distinct count: two IDENTICAL nodes at (0,-20) cover candidates 2 (0,-41) and 6 (0,-55) and count once; candidate 1 is covered by two different nodes (0,10) and (0,30) -> cost 2;
// candidate 2 costs 1 (raw 2). Rest: (0,-57) covers 12, 18, 24; (0,30) also covers 5 and 11; (0,71) covers 15, 21, 27; +-19 columns by COVER's three nodes each.
cases.push({ name: "fallback: identical node boxes count once: candidate 2 costs 1 (two identical nodes), candidate 1 costs 2 -> (0, -41)", ...ownerScene([[0, -57], [0, -20], [0, -20], [0, 10], [0, 30], [0, 71], [19, -37], [19, 6], [19, 95], [-19, -37], [-19, 6], [-19, 95]]), expect: [[0, -41]] });
// Identical LABEL boxes count once: COVER and COVER2' (second cover for every candidate but candidate 1) give candidate 1 cost 1 and every other cost 2 for the first label;
// label 1 -> candidate 1; label 2 -> candidate 1 again (cost 2 = tie, earliest) so its box is identical to label 1's; label 3: candidate 1 hits the node plus ONE distinct label box = 2 (raw 3) -> still candidate 1.
const SC: Array<[number, number]> = [[0, -57], [0, -16], [0, 39], [0, 71], [0, -58], [0, -17], [0, 42], [0, 72],
  [19, -37], [19, 6], [19, 95], [19, -38], [19, 5], [19, 94], [-19, -37], [-19, 6], [-19, 95], [-19, -38], [-19, 5], [-19, 94]];
cases.push({ name: "fallback: three identical labels end on one identical box; the third counts it once (cost 2, not 3) and keeps candidate 1", nodes: [[0, 0], ...SC], labels: [nodeLabel(1, 0, 24), nodeLabel(1, 0, 24), nodeLabel(1, 0, 24)], expect: [[0, 0], [0, 0], [0, 0]] });
// Edge labels: label u = 1 at (0,0), h = 15. Nodes at bx = 0 block all three columns of an oy. ECOVER windows (by-17, by+24): (-71,-30) (-29,12) (5,46) (43,84) hold every candidate oy exactly once:
// -70 -56 -42 | -28 -14 0 | 18 32 | 46 60 74.
const ECOVER: Array<[number, number]> = [[0, -54], [0, -12], [0, 22], [0, 60]];
cases.push({ name: "edge fallback: all 29 candidates cost 1 -> tie -> (0, 0)", nodes: ECOVER, labels: [edgeLabel(1, 0, 0)], expect: [[0, 0]] });
// + (0,0): window (-17,24) adds 1 to oy -14, 0, 18 in all three columns: candidates 1..5 cost 2; candidate 6 (0,-28) costs 1 -> (0, -28).
cases.push({ name: "edge fallback: candidates 1..5 cost 2, candidate 6 costs 1 -> (0, -28)", nodes: [...ECOVER, [0, 0]], labels: [edgeLabel(1, 0, 0)], expect: [[0, -28]] });
// The fallback box is recorded at the CHOSEN position: u=5 is boxed in (h = 33, W = 36.5, the same bx = 0 cover blocks every column once) -> (0,0), box x -22.5..22.5;
// the next u=1 label at x = 27.5 (left edge 23, 0.5 px from it) collides at candidate 1 only: candidate 2 (0,-14) is free.
cases.push({ name: "edge fallback: a fallback label is recorded as an obstacle at its chosen (0,0) box: the next label avoids it", nodes: ECOVER, labels: [edgeLabel(5, 0, 0), edgeLabel(1, 27.5, 0)], expect: [[0, 0], [0, -14]] });

// Labels against labels.
cases.push({ name: "four identical node labels u=3 at (0,100) then a fifth: (0,0) (0,-41) (28,-20) (-28,-20) (0,14); the fifth sits exactly 1 px under the first", nodes: [],
  labels: [nodeLabel(3, 0, 100), nodeLabel(3, 0, 100), nodeLabel(3, 0, 100), nodeLabel(3, 0, 100), nodeLabel(3, 0, 100)], expect: [[0, 0], [0, -41], [28, -20], [-28, -20], [0, 14]] });
cases.push({ name: "node label then edge label at the same point: the edge label uses the edge list (0,-14)", nodes: [], labels: [nodeLabel(2, 0, 0), edgeLabel(2, 0, 0)], expect: [[0, 0], [0, -14]] });
cases.push({ name: "edge label then node label at the same point: the node label uses the node list (0,-41)", nodes: [], labels: [edgeLabel(2, 0, 0), nodeLabel(2, 0, 0)], expect: [[0, 0], [0, -41]] });
cases.push({ name: "label beside label of other width: u=2 at 0 (right edge 9), u=3 at 23.5 (left edge 10, gap exactly 1 px) -> both stay", nodes: [], labels: [edgeLabel(2, 0, 0), edgeLabel(3, 23.5, 0)], expect: [[0, 0], [0, 0]] });
cases.push({ name: "label beside label of other width: u=3 at 23.5 - 1 micro-pixel -> candidate 2 (0,-14)", nodes: [], labels: [edgeLabel(2, 0, 0), { kind: "edge", units: 3, x: px(23.5) - eps, y: 0n }], expect: [[0, 0], [0, -14]] });
cases.push({ name: "label below label: top exactly 1 px under the bottom -> free", nodes: [], labels: [edgeLabel(1, 0, 0), edgeLabel(1, 0, 14)], expect: [[0, 0], [0, 0]] });
cases.push({ name: "label below label short by 1 micro-pixel: candidate 1 still overlaps, candidate 2 (0,18) is free", nodes: [], labels: [edgeLabel(1, 0, 0), { kind: "edge", units: 1, x: 0n, y: px(14) - eps }], expect: [[0, 0], [0, 18]] });
cases.push({ name: "a placed label is an obstacle at its CHOSEN position, not its default: third label takes the freed default spot",
  nodes: [], labels: [edgeLabel(1, 0, 100), edgeLabel(1, 0, 100), edgeLabel(1, 0, 114)],
  // 1st stays (0,100); 2nd moves to (0,86); 3rd default y 114: top 104 is 1 px under the first's bottom 103 -> free
  expect: [[0, 0], [0, -14], [0, 0]] });
cases.push({ name: "no nodes, no labels", nodes: [], labels: [], expect: [] });
cases.push({ name: "nodes but no labels", nodes: [[0, 0], [100, 100]], labels: [], expect: [] });

const toInput = (c: Case, sx = 0n, sy = 0n): PlaceLabelsInput => ({
  nodes: c.nodes.map(([x, y]) => ({ cx: px(x) + sx, cy: px(y) + sy })),
  labels: c.labels.map((l) => ({ ...l, x: l.x + sx, y: l.y + sy })),
});

describe("placeLabels: hand-computed cases (design 37 sections 4 to 6)", () => {
  it("has at least 25 hand-computed cases (rev 3)", () => { expect(cases.length).toBeGreaterThanOrEqual(25); });
  for (const c of cases) it(c.name, () => {
    expect(placeLabels(toInput(c)).map((r) => [r.dx, r.dy])).toEqual(c.expect);
    expect(allPairs(toInput(c)).map((r) => [r.dx, r.dy])).toEqual(c.expect); // the reference agrees with the hand computation
  });
});

describe("placeLabels: translation by whole and fractional micro-pixels, negative and near 2^40 px (grid cell boundaries move, results do not)", () => {
  const T40 = 1n << 40n;
  const shifts: Array<[string, bigint, bigint]> = [
    ["-1 micro-pixel", -1n, -1n], ["+64 px", 64n * P, 64n * P], ["-64 px", -64n * P, -64n * P], ["-1000.123457 px", -1_000_123_457n, 777_777_777n],
    ["+2^40 px - 5.25 px", T40 * P - px(5.25), T40 * P - px(5.75)], ["-2^40 px + 3.5 px", -T40 * P + px(3.5), -T40 * P + px(60.000001)],
    ["mixed 2^40 / -2^40", T40 * P, -T40 * P],
  ];
  for (const [label, sx, sy] of shifts) it(`all hand cases give the same result shifted by ${label}`, () => {
    for (const c of cases) expect(placeLabels(toInput(c, sx, sy)).map((r) => [r.dx, r.dy]), c.name).toEqual(c.expect);
  });
});

describe("placeLabels: contract", () => {
  it("is exported from the package index as a value with the documented shape", () => {
    expect(api.placeLabels).toBe(placeLabels);
    expect(placeLabels.length).toBe(1);
  });
  it("order dependence: the first label of a colliding pair keeps its spot, the second moves, and swapping the order swaps who moves", () => {
    const P1: Lab = nodeLabel(1, 0, 100), Q1: Lab = nodeLabel(1, 0, 113);
    expect(run([], [P1, Q1])).toEqual([[0, 0], [0, -41]]);
    expect(run([], [Q1, P1])).toEqual([[0, 0], [0, -41]]); // now P1 is the one that moved: it is the second entry
    expect(run([], [Q1])).toEqual([[0, 0]]);
    expect(run([], [P1])).toEqual([[0, 0]]);
  });
  it("output has the length and order of the labels and whole-pixel integers (never -0)", () => {
    const out = placeLabels({ nodes: nodes([0, 0]), labels: [nodeLabel(3, 0, 24), nodeLabel(3, 0, 24), edgeLabel(2, 5, 5), edgeLabel(2, 5, 5)] });
    expect(out.length).toBe(4);
    for (const r of out) for (const v of [r.dx, r.dy]) { expect(Number.isInteger(v)).toBe(true); expect(Object.is(v, -0)).toBe(false); }
  });
  it("does not mutate its input and is deterministic", () => {
    const input: PlaceLabelsInput = {
      nodes: Object.freeze([Object.freeze({ cx: 0n, cy: 0n }), Object.freeze({ cx: px(30), cy: px(-7.25) })]) as PlaceLabelsInput["nodes"],
      labels: Object.freeze([Object.freeze(nodeLabel(4, 0, 24)), Object.freeze(nodeLabel(4, 0, 24)), Object.freeze(edgeLabel(1, 15, 0))]) as PlaceLabelsInput["labels"],
    };
    const a = placeLabels(input), b = placeLabels(input);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(input.labels.length).toBe(3);
  });
  it("labels that are only 1 px apart in every direction do not slow it or break it for wide units (no throw)", () => {
    expect(() => placeLabels({ nodes: [], labels: [{ kind: "node", units: 5000, x: 0n, y: 0n }, { kind: "edge", units: 5000, x: 0n, y: 0n }] })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// grid == all-pairs on seeded pseudo-random inputs
// ---------------------------------------------------------------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const CELL = 64n * P;
const fdiv = (a: bigint, b: bigint): bigint => { const q = a / b; return a % b !== 0n && a < 0n ? q - 1n : q; };

function randomInput(seed: number): PlaceLabelsInput {
  const r = mulberry32(seed * 2654435761 + 12345);
  const ri = (lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));
  const span = [24, 60, 150, 400, 2500][ri(0, 4)]!;
  const baseSel = ri(0, 7);
  const T40 = 1n << 40n;
  const base = baseSel === 0 ? -T40 * P + px(ri(0, 500)) : baseSel === 1 ? T40 * P - px(ri(600, 4000)) : baseSel === 2 ? -px(ri(0, 100000)) : baseSel === 3 ? 0n : px(ri(-300, 300));
  const frac = r() < 0.5; // fractional micro-pixels
  const snapP = [0, 0.25, 0.5][ri(0, 2)]!; // nodes and labels on or near 64 px cell lines
  const coord = (): bigint => {
    let v = base + BigInt(Math.floor(r() * span * 1e6));
    if (!frac) v -= ((v % P) + P) % P;
    if (r() < snapP) {
      v = fdiv(v, CELL) * CELL;
      const adj = [0n, P, -P, 13n * P, 14n * P, -13n * P, -14n * P, 3n * P, 17n * P, 1n, -1n, 500_000n][ri(0, 11)]!;
      v += adj;
    }
    return v;
  };
  const dens = [0.2, 0.6, 1, 2.5][ri(0, 3)]!;
  const nNodes = Math.floor(ri(0, 40) * dens), nNodeLabels = Math.floor(ri(0, 25) * dens), nEdgeLabels = Math.floor(ri(0, 40) * dens);
  const ns = Array.from({ length: nNodes }, () => ({ cx: coord(), cy: coord() }));
  const maxUnits = r() < 0.15 ? 90 : 14;
  const labels: Lab[] = [];
  for (let i = 0; i < nNodeLabels; i++) {
    const own = ns.length > 0 && r() < 0.7 ? ns[ri(0, ns.length - 1)]! : { cx: coord(), cy: coord() };
    labels.push({ kind: "node", units: ri(1, maxUnits), x: own.cx, y: own.cy + 24n * P });
  }
  for (let i = 0; i < nEdgeLabels; i++) labels.push({ kind: "edge", units: ri(1, maxUnits), x: coord(), y: coord() });
  return { nodes: ns, labels };
}

describe("placeLabels: grid result equals the exact all-pairs rule", () => {
  it("equals the all-pairs reading on 4,000 seeded pseudo-random inputs (varied density, width, sign, 2^40 px, fractional micro-pixels, cell-line nodes)", () => {
    let moved = 0, total = 0, withLabels = 0;
    for (let seed = 1; seed <= 4000; seed++) {
      const input = randomInput(seed);
      const got = placeLabels(input), want = allPairs(input);
      expect(got, `seed ${seed}`).toEqual(want);
      for (const g of got) { total++; if (g.dx !== 0 || g.dy !== 0) moved++; }
      if (input.labels.length > 0) withLabels++;
    }
    // the run is not vacuous: many labels were moved, many were not
    expect(withLabels).toBeGreaterThan(3000);
    expect(moved).toBeGreaterThan(5000);
    expect(total - moved).toBeGreaterThan(5000);
  });
  it("equals the all-pairs reading on 1,000 very crowded inputs (labels piled on a few points among coincident and nearby nodes: the fewest-collisions fallback runs constantly)", { timeout: 120_000 }, () => {
    const stats = { fallbacks: 0 };
    let beyond = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const r = mulberry32(seed + 424243);
      const ri = (lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));
      const pts = Array.from({ length: ri(1, 3) }, () => ({ x: px(ri(-50, 50)) + (seed % 3 === 0 ? (1n << 40n) * P : 0n), y: px(ri(-50, 50)) }));
      const ns = Array.from({ length: ri(0, 50) }, () => { const p = pts[ri(0, pts.length - 1)]!; return { cx: p.x + px(ri(-30, 30)), cy: p.y + px(ri(-30, 30)) }; });
      const labels: Lab[] = [];
      for (let i = 0, n = ri(20, 110); i < n; i++) { const p = pts[ri(0, pts.length - 1)]!; labels.push({ kind: r() < 0.5 ? "node" : "edge", units: ri(1, 3), x: p.x + px(ri(0, 2)), y: p.y + px(ri(0, 2)) }); }
      const input: PlaceLabelsInput = { nodes: ns, labels };
      const got = placeLabels(input);
      expect(got, `very crowded ${seed}`).toEqual(allPairs(input, stats));
      for (const g of got) if (g.dy <= -56 || g.dy >= 56) beyond++;
    }
    expect(stats.fallbacks).toBeGreaterThan(2000); // the fewest-collisions rule is exercised, not just the free-candidate rule
    expect(beyond).toBeGreaterThan(2000); // candidates 12..29 are used
  });
  it("equals the all-pairs reading on crowded inputs (many labels at identical default positions)", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = mulberry32(seed + 99991);
      const n = 1 + Math.floor(r() * 40);
      const px0 = px(Math.floor(r() * 200) - 100), py0 = px(Math.floor(r() * 200) - 100);
      const labels: Lab[] = [];
      for (let i = 0; i < n; i++) labels.push({ kind: r() < 0.5 ? "node" : "edge", units: 1 + Math.floor(r() * 6), x: px0 + BigInt(Math.floor(r() * 3)) * P, y: py0 + BigInt(Math.floor(r() * 3)) * P });
      const input: PlaceLabelsInput = { nodes: [{ cx: px0, cy: py0 }], labels };
      expect(placeLabels(input), `crowded ${seed}`).toEqual(allPairs(input));
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// performance (design 37 section 7): near-linear, not all-pairs
// ---------------------------------------------------------------------------------------------------------------------------------
describe("placeLabels: performance at the default capacities (printed; the bound is deliberately generous)", () => {
  const nNodes = 20_000, nEdge = 40_000;
  const grid = (): PlaceLabelsInput["nodes"] => Array.from({ length: nNodes }, (_, i) => ({ cx: BigInt(i % 200) * 40n * P, cy: BigInt(Math.floor(i / 200)) * 40n * P }));
  const timed = (name: string, input: PlaceLabelsInput): void => {
    const t0 = performance.now();
    const out = placeLabels(input);
    const ms = performance.now() - t0;
    console.info(`[labelplace perf] ${name}: ${input.nodes.length} nodes, ${input.labels.length} labels in ${ms.toFixed(0)} ms`);
    expect(out.length).toBe(input.labels.length);
    expect(ms).toBeLessThan(20_000);
  };
  it("20,000 nodes and 40,000 edge labels spread over the node field (timing printed)", () => {
    const r = mulberry32(7);
    const labels: Lab[] = Array.from({ length: nEdge }, () => ({ kind: "edge" as const, units: 1 + Math.floor(r() * 12), x: BigInt(Math.floor(r() * 8000)) * P, y: BigInt(Math.floor(r() * 4000)) * P }));
    timed("spread edge labels", { nodes: grid(), labels });
  });
  it("20,000 nodes, 20,000 node labels and 40,000 edge labels (timing printed)", () => {
    const r = mulberry32(8);
    const ns = grid();
    const labels: Lab[] = ns.map((n) => ({ kind: "node" as const, units: 1 + Math.floor(r() * 10), x: n.cx, y: n.cy + 24n * P }));
    for (let i = 0; i < nEdge; i++) labels.push({ kind: "edge", units: 1 + Math.floor(r() * 12), x: BigInt(Math.floor(r() * 8000)) * P, y: BigInt(Math.floor(r() * 4000)) * P });
    timed("node + edge labels", { nodes: ns, labels });
  });
  it("20,000 nodes and 40,000 edge labels all at the same default position (timing printed)", () => {
    const labels: Lab[] = Array.from({ length: nEdge }, () => ({ kind: "edge" as const, units: 4, x: 3000n * P, y: 1500n * P }));
    timed("same default position", { nodes: grid(), labels });
  });
  it("20,000 nodes and 40,000 edge labels in a dense 1000 x 500 px cluster, integer positions, units 1..6 (timing printed)", () => {
    const r = mulberry32(11);
    const labels: Lab[] = Array.from({ length: nEdge }, () => ({ kind: "edge" as const, units: 1 + Math.floor(r() * 6), x: BigInt(Math.floor(r() * 1000)) * P, y: BigInt(Math.floor(r() * 500)) * P }));
    timed("dense 1000 x 500 cluster of edge labels", { nodes: grid(), labels });
  });
  it("20,000 nodes in the cluster field and 40,000 labels (node and edge) at 50 distinct default positions (timing printed)", () => {
    const r = mulberry32(12);
    const labels: Lab[] = Array.from({ length: nEdge }, () => ({ kind: r() < 0.5 ? ("node" as const) : ("edge" as const), units: 4, x: BigInt(Math.floor(r() * 10)) * 5n * P, y: BigInt(Math.floor(r() * 5)) * 5n * P }));
    timed("50 default positions", { nodes: grid(), labels });
  });
  it("20,000 nodes at one point and 40,000 node labels at one default position (timing printed)", () => {
    const ns = Array.from({ length: nNodes }, () => ({ cx: 0n, cy: 0n }));
    const labels: Lab[] = Array.from({ length: nEdge }, () => ({ kind: "node" as const, units: 4, x: 0n, y: 24n * P }));
    timed("everything on one spot", { nodes: ns, labels });
  });
});

// keep the type export referenced (it is part of the new public surface)
const _typeCheck: LabelPlacement = { dx: 0, dy: 0 };
void _typeCheck;
